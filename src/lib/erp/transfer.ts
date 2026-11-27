import { shownUsername } from "@/lib/permissions";
import type { User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, parseISODate } from "@/lib/api-route";
import { addLedger, productBalance } from "@/lib/erp/stock";
import { segmentForSize } from "@/lib/erp/segments";
import { deptByCode, nextNo } from "@/lib/erp/transactions";

export const transferSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  from_size: z.string().trim().min(1),
  from_qty: z.number().int().positive(),
  to: z.array(z.object({ size: z.string().trim().min(1), qty: z.number().int().positive() })).min(1).max(20),
  notes: z.string().trim().max(300).optional(),
});

/**
 * Moves Green Tube PCS (after Step 1, no valve yet) from one size to one or more other sizes.
 * The PCS taken out must equal the PCS put in.
 */
export async function postGreenTransfer(user: User, body: z.infer<typeof transferSchema>) {
  const total = body.to.reduce((s, t) => s + t.qty, 0);
  if (total !== body.from_qty) throw new ApiError(`The sizes add up to ${total} PCS but ${body.from_qty} PCS are being transferred. They must match.`);
  const targets = body.to.map((t) => t.size);
  if (targets.includes(body.from_size)) throw new ApiError("A size cannot be transferred to itself.");
  if (new Set(targets).size !== targets.length) throw new ApiError("Each size can be listed once.");

  const known = new Set(
    (await prisma.inventoryItem.findMany({ where: { group: "Finished Goods", active: true }, select: { name: true } })).map((r) => r.name),
  );
  for (const s of [body.from_size, ...targets]) {
    if (!known.has(s)) throw new ApiError(`Size ${s} is not a Finished Goods row in Item Master. Add it there first.`);
  }
  const date = parseISODate(body.date);
  const green = await deptByCode("EXTRUSION");

  return prisma.$transaction(async (tx) => {
    const from = await tx.product.findFirst({ where: { size: body.from_size, valveType: "" } });
    const have = from ? await productBalance(tx, from.id, green.id) : 0;
    if (!from || have < body.from_qty) throw new ApiError(`Only ${have} Green Tube PCS of ${body.from_size} are in stock.`);

    const v = await tx.voucher.create({
      data: {
        voucherNo: await nextNo(tx, "voucher", "GTT", date),
        voucherType: "TRANSFER",
        voucherDate: date,
        departmentId: green.id,
        productId: from.id,
        inputQty: body.from_qty,
        outputQty: total,
        notes: body.notes || `${body.from_size} to ${body.to.map((t) => `${t.size} ${t.qty}`).join(", ")}`,
        createdBy: user.id,
      },
    });
    await addLedger(tx, v.id, "PRODUCT", from.id, green.id, { qtyOut: body.from_qty, unit: "PCS" });
    for (const t of body.to) {
      const p =
        (await tx.product.findFirst({ where: { size: t.size, valveType: "" } })) ??
        (await tx.product.create({ data: { size: t.size, valveType: "", segment: segmentForSize(t.size) } }));
      await addLedger(tx, v.id, "PRODUCT", p.id, green.id, { qtyIn: t.qty, unit: "PCS" });
    }
    return { voucher_no: v.voucherNo, from: body.from_size, qty: body.from_qty };
  });
}

/** Recent Green Tube transfers with their sizes. */
export async function listGreenTransfers() {
  const rows = await prisma.voucher.findMany({
    where: { voucherType: "TRANSFER" },
    orderBy: { id: "desc" },
    take: 100,
    include: { stockLedgers: { orderBy: { id: "asc" } }, creator: { select: { username: true } } },
  });
  const ids = [...new Set(rows.flatMap((v) => v.stockLedgers.map((l) => l.itemId)))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, size: true } });
  const size = new Map(products.map((p) => [p.id, p.size]));
  return rows.map((v) => {
    const out = v.stockLedgers.find((l) => Number(l.qtyOut) > 0 && Number(l.qtyIn) === 0);
    const ins = v.stockLedgers.filter((l) => Number(l.qtyIn) > 0);
    return {
      voucher_no: v.voucherNo,
      date: v.voucherDate.toISOString().slice(0, 10),
      status: v.status,
      by: shownUsername(v.creator?.username),
      from_size: out ? size.get(out.itemId) ?? "" : "",
      from_qty: Number(v.inputQty),
      // A removed transfer has reversing lines too; show only the original ones.
      to: ins.filter((l) => l.itemId !== out?.itemId).map((l) => ({ size: size.get(l.itemId) ?? "", qty: Number(l.qtyIn) })),
      notes: v.notes,
    };
  });
}

/** Undoes a transfer, as long as the PCS it added are still in Green Tube stock. */
export async function voidGreenTransfer(user: User, voucherNo: string) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.voucher.findUnique({ where: { voucherNo }, include: { stockLedgers: true } });
    if (!v || v.voucherType !== "TRANSFER") throw new ApiError("Transfer not found", 404);
    if (v.status === "VOID") throw new ApiError(`${voucherNo} is already removed.`);
    for (const l of v.stockLedgers.filter((x) => Number(x.qtyIn) > 0)) {
      const have = await productBalance(tx, l.itemId, l.departmentId);
      if (have < Number(l.qtyIn)) {
        const p = await tx.product.findUnique({ where: { id: l.itemId } });
        throw new ApiError(`${p?.size ?? "A size"} has only ${have} PCS left of the ${Number(l.qtyIn)} added, so this transfer cannot be removed.`, 409);
      }
    }
    for (const l of v.stockLedgers) {
      const back = Number(l.qtyIn) > 0 ? { qtyOut: Number(l.qtyIn) } : { qtyIn: Number(l.qtyOut) };
      await addLedger(tx, v.id, "PRODUCT", l.itemId, l.departmentId, { ...back, unit: l.unit });
    }
    await tx.voucher.update({ where: { id: v.id }, data: { status: "VOID", notes: `Removed by ${user.username}. ${v.notes ?? ""}`.trim() } });
    return { voucher_no: voucherNo };
  });
}
