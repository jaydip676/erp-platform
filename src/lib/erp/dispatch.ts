import { shownUsername } from "@/lib/permissions";
import type { User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, parseISODate } from "@/lib/api-route";
import { addLedger, productBalance, r4, rawMaterialBalance, storeItemBalance } from "@/lib/erp/stock";
import { deptByCode, nextNo } from "@/lib/erp/transactions";
import { STORE_GROUPS, drawInOrder, finalGroup, masterGroup } from "@/lib/erp/codes";
import { itemNamer } from "@/lib/erp/labels";
import { productName } from "@/lib/erp/product-name";

export const dispatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  client_id: z.number().int(),
  notes: z.string().trim().max(300).optional(),
  lines: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("FG"), product_id: z.number().int(), qty: z.number().int().positive() }),
        z.object({ kind: z.literal("RAW"), item_id: z.number().int(), qty: z.number().positive() }),
        z.object({ kind: z.literal("STORE"), item_id: z.number().int(), qty: z.number().positive() }),
        z.object({ kind: z.literal("MASTER"), group: z.string().trim().min(1), kg: z.number().positive() }),
        z.object({ kind: z.literal("FINAL"), group: z.string().trim().min(1), kg: z.number().positive() }),
      ]),
    )
    .min(1)
    .max(100),
});

const groupOf = (kind: "MASTER" | "FINAL", batchNo: string) => (kind === "MASTER" ? masterGroup(batchNo) : finalGroup(batchNo));

/** What can be dispatched right now: finished goods by size / valve / brand, and batch groups with their KG. */
export async function dispatchOptions() {
  const [fg, rawDept, storeDept] = await Promise.all([deptByCode("FG"), deptByCode("RAW"), deptByCode("STORE")]);
  // Everything that has stock, read in one round of queries (each database trip is slow).
  const [fgRows, rawRows0, storeRows0, batches] = await Promise.all([
    prisma.stockLedger.groupBy({ by: ["itemId"], where: { itemType: "PRODUCT", departmentId: fg.id }, _sum: { qtyIn: true, qtyOut: true } }),
    prisma.stockLedger.groupBy({ by: ["itemId"], where: { itemType: "RAW", departmentId: rawDept.id }, _sum: { qtyIn: true, qtyOut: true } }),
    prisma.stockLedger.groupBy({ by: ["itemId"], where: { itemType: "STORE", departmentId: storeDept.id }, _sum: { qtyIn: true, qtyOut: true } }),
    prisma.batch.findMany({ where: { status: "READY", availableKg: { gt: 0 }, batchType: { in: ["MASTER", "FINAL"] } }, orderBy: { id: "asc" } }),
  ]);
  const balances = (rows: typeof fgRows) => new Map(rows.map((r) => [r.itemId, r4(Number(r._sum.qtyIn ?? 0) - Number(r._sum.qtyOut ?? 0))]));
  const have = balances(fgRows);
  const rawHave = balances(rawRows0);
  const storeHave = balances(storeRows0);
  const [products, rawRows, storeRows] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: [...have.keys()] } }, orderBy: [{ size: "asc" }, { valveType: "asc" }, { brand: "asc" }] }),
    prisma.rawMaterial.findMany({ where: { id: { in: [...rawHave.keys()] } }, orderBy: { name: "asc" } }),
    prisma.inventoryItem.findMany({ where: { id: { in: [...storeHave.keys()] }, group: { in: STORE_GROUPS } }, orderBy: { name: "asc" } }),
  ]);

  const finished = products
    .filter((p) => (have.get(p.id) ?? 0) > 0)
    .map((p) => ({ product_id: p.id, size: p.size, valve: p.valveType, brand: p.brand, balance: have.get(p.id) ?? 0 }));
  const groups = (kind: "MASTER" | "FINAL") => {
    const m = new Map<string, { group: string; kg: number; batches: number }>();
    for (const b of batches.filter((x) => x.batchType === kind)) {
      const g = groupOf(kind, b.batchNo);
      const cur = m.get(g) ?? { group: g, kg: 0, batches: 0 };
      cur.kg = r4(cur.kg + Number(b.availableKg));
      cur.batches += 1;
      m.set(g, cur);
    }
    return [...m.values()].sort((a, b) => a.group.localeCompare(b.group));
  };
  return {
    fg: finished,
    master: groups("MASTER"),
    final: groups("FINAL"),
    raw: rawRows.filter((m) => (rawHave.get(m.id) ?? 0) > 0).map((m) => ({ item_id: m.id, name: m.name, unit: "KG", balance: rawHave.get(m.id) ?? 0 })),
    store: storeRows.filter((i) => (storeHave.get(i.id) ?? 0) > 0).map((i) => ({ item_id: i.id, name: i.name, unit: i.unit || "PCS", group: i.group, balance: storeHave.get(i.id) ?? 0 })),
  };
}

/** Sends finished goods and batch KG to a client. Stock leaves the same department it sits in. */
export async function postDispatch(user: User, body: z.infer<typeof dispatchSchema>) {
  const date = parseISODate(body.date);
  const client = await prisma.client.findFirst({ where: { id: body.client_id, active: true } });
  if (!client) throw new ApiError("Choose the client.");

  // The same item listed twice counts once, added together.
  const fgQty = new Map<number, number>();
  const rawQty = new Map<number, number>();
  const storeQty = new Map<number, number>();
  const kgByGroup = new Map<string, { kind: "MASTER" | "FINAL"; group: string; kg: number }>();
  for (const l of body.lines) {
    if (l.kind === "FG") fgQty.set(l.product_id, (fgQty.get(l.product_id) ?? 0) + l.qty);
    else if (l.kind === "RAW") rawQty.set(l.item_id, r4((rawQty.get(l.item_id) ?? 0) + l.qty));
    else if (l.kind === "STORE") storeQty.set(l.item_id, r4((storeQty.get(l.item_id) ?? 0) + l.qty));
    else {
      const k = `${l.kind}|${l.group}`;
      const cur = kgByGroup.get(k) ?? { kind: l.kind, group: l.group, kg: 0 };
      cur.kg = r4(cur.kg + l.kg);
      kgByGroup.set(k, cur);
    }
  }
  const fg = await deptByCode("FG");
  const dept = { MASTER: await deptByCode("MASTER"), FINAL: await deptByCode("FINAL") };
  const rawDept = await deptByCode("RAW");
  const storeDept = await deptByCode("STORE");

  return prisma.$transaction(
    async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: [...fgQty.keys()] } } });
      for (const [id, qty] of fgQty) {
        const p = products.find((x) => x.id === id);
        if (!p) throw new ApiError("Finished good not found.", 404);
        const bal = await productBalance(tx, id, fg.id);
        if (bal < qty) throw new ApiError(`Only ${bal} PCS of ${productName(p)} are in finished goods stock.`);
      }

      const rawItems = await tx.rawMaterial.findMany({ where: { id: { in: [...rawQty.keys()] } } });
      for (const [id, qty] of rawQty) {
        const m = rawItems.find((x) => x.id === id);
        if (!m) throw new ApiError("Raw material not found.", 404);
        const bal = await rawMaterialBalance(tx, id);
        if (bal + 0.0005 < qty) throw new ApiError(`Only ${Number(bal.toFixed(3))} KG of ${m.name} are in stock.`);
      }
      const storeItems = await tx.inventoryItem.findMany({ where: { id: { in: [...storeQty.keys()] }, group: { in: STORE_GROUPS } } });
      for (const [id, qty] of storeQty) {
        const it = storeItems.find((x) => x.id === id);
        if (!it) throw new ApiError("Store item not found.", 404);
        const bal = await storeItemBalance(tx, id);
        if (bal + 0.0005 < qty) throw new ApiError(`Only ${Number(bal.toFixed(3))} ${it.unit || "PCS"} of ${it.name} are in stock.`);
      }

      const draws: { kind: "MASTER" | "FINAL"; id: number; kg: number; left: number }[] = [];
      for (const g of kgByGroup.values()) {
        const all = await tx.batch.findMany({ where: { batchType: g.kind, status: "READY", availableKg: { gt: 0 } }, orderBy: { id: "asc" } });
        const pool = all.filter((b) => groupOf(g.kind, b.batchNo) === g.group);
        const have = pool.reduce((s, b) => s + Number(b.availableKg), 0);
        if (have + 0.0005 < g.kg) throw new ApiError(`${g.group} has only ${Number(have.toFixed(3))} KG left.`);
        const { out } = drawInOrder(pool.map((b) => ({ id: b.id, available_kg: Number(b.availableKg) })), g.kg);
        for (const d of out) {
          const b = pool.find((x) => x.id === d.batch.id)!;
          draws.push({ kind: g.kind, id: b.id, kg: r4(d.kg), left: r4(Number(b.availableKg) - d.kg) });
        }
      }

      const pcs = [...fgQty.values()].reduce((s, n) => s + n, 0);
      const kg = r4(draws.reduce((s, d) => s + d.kg, 0));
      const v = await tx.voucher.create({
        data: {
          voucherNo: await nextNo(tx, "voucher", "DSP", date),
          voucherType: "DISPATCH",
          voucherDate: date,
          clientId: client.id,
          outputQty: pcs,
          consumedKg: kg,
          notes: body.notes || null,
          createdBy: user.id,
        },
      });
      for (const [id, qty] of fgQty) await addLedger(tx, v.id, "PRODUCT", id, fg.id, { qtyOut: qty, unit: "PCS" });
      for (const [id, qty] of rawQty) await addLedger(tx, v.id, "RAW", id, rawDept.id, { qtyOut: qty, unit: "KG" });
      for (const [id, qty] of storeQty) await addLedger(tx, v.id, "STORE", id, storeDept.id, { qtyOut: qty, unit: storeItems.find((x) => x.id === id)!.unit || "PCS" });
      for (const d of draws) {
        await tx.batch.update({ where: { id: d.id }, data: { availableKg: d.left, status: d.left <= 0.0005 ? "CONSUMED" : "READY" } });
        await addLedger(tx, v.id, "BATCH", d.id, dept[d.kind].id, { qtyOut: d.kg, unit: "KG" });
      }
      return { voucher_no: v.voucherNo, client: client.name, pcs, kg };
    },
    { timeout: 60000, maxWait: 20000 },
  );
}

/** Recent dispatches with what was sent, newest first. */
export async function listDispatches(clientId?: number) {
  const [rows, name] = await Promise.all([
    prisma.voucher.findMany({
      where: { voucherType: "DISPATCH", ...(clientId ? { clientId } : {}) },
      orderBy: { id: "desc" },
      take: 200,
      include: { client: true, stockLedgers: { orderBy: { id: "asc" } }, creator: { select: { username: true } } },
    }),
    itemNamer(),
  ]);
  return rows.map((v) => ({
    voucher_no: v.voucherNo,
    date: v.voucherDate.toISOString().slice(0, 10),
    status: v.status,
    client: v.client?.name ?? "",
    by: shownUsername(v.creator?.username),
    notes: v.notes,
    // A removed dispatch also has the reversing lines; show only what went out.
    lines: v.stockLedgers
      .filter((l) => Number(l.qtyOut) > 0)
      .map((l) => ({ item: name(l.itemType, l.itemId), qty: Number(l.qtyOut), unit: l.unit })),
  }));
}

/** Takes a dispatch back: finished goods return to stock and the KG go back to their batches. */
export async function voidDispatch(user: User, voucherNo: string) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.voucher.findUnique({ where: { voucherNo }, include: { stockLedgers: true } });
    if (!v || v.voucherType !== "DISPATCH") throw new ApiError("Dispatch not found", 404);
    if (v.status === "VOID") throw new ApiError(`${voucherNo} is already removed.`);
    for (const l of v.stockLedgers.filter((x) => Number(x.qtyOut) > 0)) {
      const back = Number(l.qtyOut);
      await addLedger(tx, v.id, l.itemType, l.itemId, l.departmentId, { qtyIn: back, unit: l.unit });
      if (l.itemType === "BATCH") {
        const b = await tx.batch.findUnique({ where: { id: l.itemId } });
        if (b && b.status !== "DELETED") await tx.batch.update({ where: { id: b.id }, data: { availableKg: r4(Number(b.availableKg) + back), status: "READY" } });
      }
    }
    await tx.voucher.update({ where: { id: v.id }, data: { status: "VOID", notes: `Removed by ${user.username}. ${v.notes ?? ""}`.trim() } });
    return { voucher_no: voucherNo };
  });
}
