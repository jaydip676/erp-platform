import { Prisma, type PrismaClient } from "@prisma/client";

import { DEPARTMENTS } from "@/lib/erp/flow";

type Db = PrismaClient | Prisma.TransactionClient;

let namesSynced = false;
/** Keeps stored department names in line with the plant's names (once per server start). */
export async function syncDepartmentNames(db: Db) {
  if (namesSynced) return;
  namesSynced = true;
  try {
    await Promise.all(DEPARTMENTS.map(([code, name]) => db.department.updateMany({ where: { code, NOT: { name } }, data: { name } })));
  } catch {
    namesSynced = false;
  }
}

export async function rawMaterialBalance(db: Db, materialId: number) {
  const rows = await db.stockLedger.groupBy({
    by: ["itemId"],
    where: { itemType: "RAW", itemId: materialId },
    _sum: { qtyIn: true, qtyOut: true },
  });
  const s = rows[0]?._sum;
  return Number(s?.qtyIn ?? 0) - Number(s?.qtyOut ?? 0);
}

export async function storeItemBalance(db: Db, itemId: number) {
  const rows = await db.stockLedger.groupBy({
    by: ["itemId"],
    where: { itemType: "STORE", itemId },
    _sum: { qtyIn: true, qtyOut: true },
  });
  const s = rows[0]?._sum;
  return Number(s?.qtyIn ?? 0) - Number(s?.qtyOut ?? 0);
}

export async function productBalance(db: Db, productId: number, departmentId: number) {
  const rows = await db.stockLedger.groupBy({
    by: ["itemId"],
    where: { itemType: "PRODUCT", itemId: productId, departmentId },
    _sum: { qtyIn: true, qtyOut: true },
  });
  const s = rows[0]?._sum;
  return Number(s?.qtyIn ?? 0) - Number(s?.qtyOut ?? 0);
}

export async function departmentItemTotal(
  db: Db,
  departmentId: number,
  itemType: string,
) {
  const rows = await db.stockLedger.groupBy({
    by: ["itemType"],
    where: { departmentId, itemType },
    _sum: { qtyIn: true, qtyOut: true },
  });
  const s = rows[0]?._sum;
  return Number(s?.qtyIn ?? 0) - Number(s?.qtyOut ?? 0);
}

/** Round to 4 decimals so float noise (119.82999999999998) never reaches the database or screen. */
export const r4 = (v: number) => Math.round((v + Number.EPSILON) * 10000) / 10000;

export function addLedger(
  db: Db,
  voucherId: number,
  itemType: string,
  itemId: number,
  departmentId: number,
  opts: { qtyIn?: number; qtyOut?: number; unit: string },
) {
  return db.stockLedger.create({
    data: {
      voucherId,
      itemType,
      itemId,
      departmentId,
      qtyIn: r4(opts.qtyIn ?? 0),
      qtyOut: r4(opts.qtyOut ?? 0),
      unit: opts.unit,
    },
  });
}

export async function stockSnapshot(db: Db) {
  // Summed in the database: one row per item, department and unit, however long the ledger grows.
  const [sums, depts] = await Promise.all([
    db.stockLedger.groupBy({ by: ["itemType", "itemId", "departmentId", "unit"], _sum: { qtyIn: true, qtyOut: true } }),
    db.department.findMany({ select: { id: true, code: true } }),
  ]);
  const code = new Map(depts.map((d) => [d.id, d.code]));
  return sums.map((r) => ({
    itemType: r.itemType,
    itemId: r.itemId,
    department: code.get(r.departmentId) ?? String(r.departmentId),
    unit: r.unit,
    balance: Number(r._sum.qtyIn ?? 0) - Number(r._sum.qtyOut ?? 0),
  }));
}