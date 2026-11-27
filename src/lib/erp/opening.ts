import { shownUsername } from "@/lib/permissions";
import { productName } from "@/lib/erp/product-name";
import type { User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, parseISODate } from "@/lib/api-route";
import { addLedger, productBalance, r4, rawMaterialBalance, storeItemBalance } from "@/lib/erp/stock";
import { STORE_GROUPS, formulaTag } from "@/lib/erp/codes";
import { segmentForSize } from "@/lib/erp/segments";
import { deptByCode, nextNo } from "@/lib/erp/transactions";
import { itemNamer } from "@/lib/erp/labels";

/** Departments that hold tube PCS. Green Tube is by size only; the rest are size / valve. */
export const OPENING_TUBE_DEPTS = ["EXTRUSION", "CURED", "QC", "FG"] as const;

const qty = z.number().finite().min(0);
export const openingLineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("RAW"), item_id: z.number().int(), qty }),
  z.object({ kind: z.literal("STORE"), item_id: z.number().int(), qty }),
  z.object({
    kind: z.literal("PRODUCT"),
    department: z.enum(OPENING_TUBE_DEPTS),
    size: z.string().trim().min(1),
    valve: z.string().trim().default(""),
    brand: z.string().trim().default(""),
    qty: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("REJECT"),
    size: z.string().trim().min(1),
    valve: z.string().trim().default(""),
    repair: z.number().int().min(0).default(0),
    second: z.number().int().min(0).default(0),
    scrap: z.number().int().min(0).default(0),
  }),
  z.object({ kind: z.literal("MASTER"), formula_id: z.number().int().nullable(), kg: qty, count: z.number().int().min(1).max(200) }),
  z.object({
    kind: z.literal("FINAL"),
    formula_id: z.number().int().nullable(),
    master_group: z.string().trim().min(1),
    kg: qty,
    count: z.number().int().min(1).max(200),
  }),
]);
export const openingBulkSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(openingLineSchema).min(1).max(5000),
});
type Line = z.infer<typeof openingLineSchema>;

async function tagFor(formulaId: number | null, type: "MASTER" | "FINAL") {
  if (formulaId == null) return "MN";
  const recipe = await prisma.recipe.findUnique({ where: { id: formulaId } });
  if (!recipe) throw new ApiError("Formula not found", 404);
  if ((recipe.batchType || "MASTER") !== type) throw new ApiError(`${recipe.name || recipe.code} is not a ${type === "MASTER" ? "master" : "final"} batch formula.`);
  return formulaTag(recipe);
}

/**
 * Posts the stock on hand before the software was used, as one opening voucher.
 * Every line lands where normal entries would put it, so the next production steps can use it.
 */
export async function postOpeningBulk(user: User, body: z.infer<typeof openingBulkSchema>) {
  const date = parseISODate(body.date);
  const lines = body.lines.filter((l: Line) => {
    if (l.kind === "REJECT") return l.repair + l.second + l.scrap > 0;
    if (l.kind === "MASTER" || l.kind === "FINAL") return l.kg > 0;
    return l.qty > 0;
  });
  if (lines.length === 0) throw new ApiError("Enter at least one quantity.");

  const [sizes, materials, storeItems] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { group: "Finished Goods", active: true }, select: { name: true } }),
    prisma.rawMaterial.findMany({ select: { id: true } }),
    prisma.inventoryItem.findMany({ where: { group: { in: STORE_GROUPS } }, select: { id: true, unit: true } }),
  ]);
  const sizeSet = new Set(sizes.map((s) => s.name));
  const brandSet = new Set((await prisma.qualityGrade.findMany({ where: { active: true }, select: { name: true } })).map((b) => b.name));
  const materialSet = new Set(materials.map((m) => m.id));
  const storeUnit = new Map(storeItems.map((s) => [s.id, s.unit || "PCS"]));

  // Check everything first, so a mistake stops the whole entry before anything is saved.
  const tags = new Map<string, string>();
  for (const l of lines) {
    if (l.kind === "RAW" && !materialSet.has(l.item_id)) throw new ApiError(`Raw material #${l.item_id} not found.`);
    if (l.kind === "STORE" && !storeUnit.has(l.item_id)) throw new ApiError(`Store item #${l.item_id} not found.`);
    if (l.kind === "PRODUCT" || l.kind === "REJECT") {
      if (!sizeSet.has(l.size)) throw new ApiError(`Size ${l.size} is not a Finished Goods row in Item Master.`);
      const needsValve = l.kind === "REJECT" || l.department !== "EXTRUSION";
      if (needsValve && !l.valve) throw new ApiError(`Choose the valve for ${l.size}.`);
      if (l.kind === "PRODUCT" && l.department === "FG") {
        if (!l.brand) throw new ApiError(`Choose the brand for ${l.size} / ${l.valve}.`);
        if (!brandSet.has(l.brand)) throw new ApiError(`Brand ${l.brand} is not in Quality (Grade).`);
      }
    }
    if (l.kind === "MASTER" || l.kind === "FINAL") {
      const key = `${l.kind}|${l.formula_id ?? ""}`;
      if (!tags.has(key)) tags.set(key, await tagFor(l.formula_id, l.kind));
    }
    if (l.kind === "FINAL" && !/^MB-[A-Z0-9]+$/.test(l.master_group)) throw new ApiError(`Master group ${l.master_group} is not valid. Use a name like MB-MASTERV2.`);
  }

  const dept = {
    RAW: await deptByCode("RAW"),
    STORE: await deptByCode("STORE"),
    MASTER: await deptByCode("MASTER"),
    FINAL: await deptByCode("FINAL"),
    QC: await deptByCode("QC"),
    EXTRUSION: await deptByCode("EXTRUSION"),
    CURED: await deptByCode("CURED"),
    FG: await deptByCode("FG"),
  };

  return prisma.$transaction(
    async (tx) => {
      const productIds = new Map<string, number>();
      const productFor = async (size: string, valve: string, brand = "") => {
        const key = `${size}|${valve}|${brand}`;
        const known = productIds.get(key);
        if (known) return known;
        const found =
          (await tx.product.findFirst({ where: { size, valveType: valve, brand } })) ??
          (await tx.product.create({ data: { size, valveType: valve, brand, segment: segmentForSize(size) } }));
        if (!found.active) await tx.product.update({ where: { id: found.id }, data: { active: true } });
        productIds.set(key, found.id);
        return found.id;
      };

      const v = await tx.voucher.create({
        data: {
          voucherNo: await nextNo(tx, "voucher", "OPN", date),
          voucherType: "OPENING",
          voucherDate: date,
          notes: body.notes || "Opening stock",
          createdBy: user.id,
        },
      });

      let batches = 0;
      let firstBatchId: number | null = null;
      for (const l of lines) {
        if (l.kind === "RAW") {
          await addLedger(tx, v.id, "RAW", l.item_id, dept.RAW.id, { qtyIn: l.qty, unit: "KG" });
        } else if (l.kind === "STORE") {
          await addLedger(tx, v.id, "STORE", l.item_id, dept.STORE.id, { qtyIn: l.qty, unit: storeUnit.get(l.item_id)! });
        } else if (l.kind === "PRODUCT") {
          const id = await productFor(l.size, l.department === "EXTRUSION" ? "" : l.valve, l.department === "FG" ? l.brand : "");
          await addLedger(tx, v.id, "PRODUCT", id, dept[l.department].id, { qtyIn: l.qty, unit: "PCS" });
        } else if (l.kind === "REJECT") {
          const id = await productFor(l.size, l.valve);
          for (const [type, n] of [["REPAIR", l.repair], ["SECOND", l.second], ["SCRAP", l.scrap]] as const) {
            if (n <= 0) continue;
            await tx.rejection.create({
              data: { voucherId: v.id, departmentId: dept.QC.id, productId: id, rejectionType: type, quantity: n, reason: "Opening stock", rejectionDate: date },
            });
          }
        } else {
          const tag = tags.get(`${l.kind}|${l.formula_id ?? ""}`)!;
          const prefix = l.kind === "MASTER" ? `MB-${tag}` : `FB-${tag}-${l.master_group}`;
          const kg = r4(l.kg);
          for (let i = 0; i < l.count; i++) {
            const b = await tx.batch.create({
              data: {
                batchNo: await nextNo(tx, "batch", prefix, date),
                batchType: l.kind,
                totalKg: kg,
                availableKg: kg,
                status: "READY",
              },
            });
            firstBatchId ??= b.id;
            batches += 1;
            await addLedger(tx, v.id, "BATCH", b.id, dept[l.kind].id, { qtyIn: kg, unit: "KG" });
          }
        }
      }
      if (firstBatchId) await tx.voucher.update({ where: { id: v.id }, data: { batchId: firstBatchId } });
      return { voucher_no: v.voucherNo, lines: lines.length, batches };
    },
    { timeout: 120000, maxWait: 20000 },
  );
}

/** Opening vouchers with every line, newest first. */
export async function listOpenings() {
  const rows = await prisma.voucher.findMany({
    where: { voucherType: "OPENING" },
    orderBy: { id: "desc" },
    take: 200,
    include: {
      stockLedgers: { include: { department: true }, orderBy: { id: "asc" } },
      rejections: { include: { product: true }, orderBy: { id: "asc" } },
      creator: { select: { username: true } },
    },
  });
  const name = await itemNamer();
  const CATEGORY: Record<string, string> = {
    RAW: "Raw material",
    STORE: "Packing store",
    MASTER: "Master batch",
    FINAL: "Final batch",
    EXTRUSION: "Green Tube",
    CURED: "Cured Tube (Press)",
    QC: "Quality Approved (Unpacked)",
    FG: "Finished Goods",
  };
  return rows.map((v) => {
    const lines = [
      ...v.stockLedgers
        .filter((l) => Number(l.qtyIn) > 0)
        .map((l) => ({
          category: CATEGORY[l.department.code] ?? l.department.name,
          item: name(l.itemType, l.itemId),
          qty: Number(l.qtyIn),
          unit: l.unit,
        })),
      ...v.rejections.map((r) => ({
        category: r.rejectionType === "REPAIR" ? "Repair" : r.rejectionType === "SECOND" ? "Second" : "Scrap",
        item: r.product ? (productName(r.product)) : "",
        qty: r.quantity,
        unit: "PCS",
      })),
    ];
    return {
      voucher_no: v.voucherNo,
      date: v.voucherDate.toISOString().slice(0, 10),
      status: v.status,
      notes: v.notes,
      by: shownUsername(v.creator?.username),
      lines,
    };
  });
}

/**
 * Takes an opening voucher back out. Refused when anything from it was already used:
 * a batch that was drawn from, or tubes / materials that have since moved on.
 */
export async function voidOpening(user: User, voucherNo: string) {
  return prisma.$transaction(
    async (tx) => {
      const v = await tx.voucher.findUnique({ where: { voucherNo }, include: { stockLedgers: true } });
      if (!v || v.voucherType !== "OPENING") throw new ApiError("Opening voucher not found", 404);
      if (v.status === "VOID") throw new ApiError(`${voucherNo} is already removed.`);
      const lines = v.stockLedgers.filter((l) => Number(l.qtyIn) > 0);
      const name = await itemNamer();

      for (const l of lines) {
        const q = Number(l.qtyIn);
        const label = name(l.itemType, l.itemId);
        if (l.itemType === "BATCH") {
          const b = await tx.batch.findUnique({ where: { id: l.itemId } });
          const other = await tx.stockLedger.count({ where: { itemType: "BATCH", itemId: l.itemId, voucherId: { not: v.id } } });
          if (!b || other > 0 || Math.abs(Number(b.availableKg) - Number(b.totalKg)) > 0.0005) {
            throw new ApiError(`${label} is already used, so this opening entry cannot be removed.`, 409);
          }
        } else {
          const have =
            l.itemType === "RAW" ? await rawMaterialBalance(tx, l.itemId)
            : l.itemType === "STORE" ? await storeItemBalance(tx, l.itemId)
            : await productBalance(tx, l.itemId, l.departmentId);
          if (have + 0.0005 < q) throw new ApiError(`${label} has only ${r4(have)} left (${q} came from this entry), so it cannot be removed.`, 409);
        }
      }
      for (const l of lines) {
        await addLedger(tx, v.id, l.itemType, l.itemId, l.departmentId, { qtyOut: Number(l.qtyIn), unit: l.unit });
        if (l.itemType === "BATCH") {
          await tx.batch.update({ where: { id: l.itemId }, data: { status: "DELETED", availableKg: 0 } });
        }
      }
      await tx.voucher.update({
        where: { id: v.id },
        data: { status: "VOID", notes: `Removed by ${user.username}. ${v.notes ?? ""}`.trim() },
      });
      return { voucher_no: voucherNo };
    },
    { timeout: 120000, maxWait: 20000 },
  );
}
