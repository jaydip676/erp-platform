import type { Prisma, User } from "@prisma/client";
import { ApiError } from "@/lib/api-route";
import { addLedger, productBalance, r4, rawMaterialBalance, storeItemBalance } from "@/lib/erp/stock";
import { itemNamer } from "@/lib/erp/labels";

type Tx = Prisma.TransactionClient;

/**
 * Takes a posted voucher back out. Stock is append-only, so every ledger line gets an opposite line
 * and the voucher is marked VOID. Refuses (409) when the stock it added has already been used,
 * so a delete can never push any stock below zero.
 */
export async function reverseVoucherTx(tx: Tx, user: Pick<User, "username">, voucherNo: string, what = "Deleted") {
  const v = await tx.voucher.findUnique({ where: { voucherNo }, include: { stockLedgers: true } });
  if (!v) throw new ApiError("Voucher not found", 404);
  if (v.status === "VOID") throw new ApiError(`${voucherNo} is already deleted.`, 409);
  const nameOf = await itemNamer();

  // What this voucher did to each item in each department (in minus out).
  const net = new Map<string, { itemType: string; itemId: number; departmentId: number; delta: number }>();
  for (const l of v.stockLedgers) {
    const key = `${l.itemType}|${l.itemId}|${l.departmentId}`;
    const cur = net.get(key) ?? { itemType: l.itemType, itemId: l.itemId, departmentId: l.departmentId, delta: 0 };
    cur.delta += Number(l.qtyIn) - Number(l.qtyOut);
    net.set(key, cur);
  }

  // Checks first, so nothing is written when the voucher cannot be removed.
  const batches: { id: number; delta: number }[] = [];
  for (const n of net.values()) {
    if (n.itemType === "BATCH") {
      batches.push({ id: n.itemId, delta: n.delta });
      continue;
    }
    if (n.delta <= 0.0000001) continue;
    const have =
      n.itemType === "PRODUCT" ? await productBalance(tx, n.itemId, n.departmentId)
      : n.itemType === "RAW" ? await rawMaterialBalance(tx, n.itemId)
      : n.itemType === "STORE" ? await storeItemBalance(tx, n.itemId)
      : Number.POSITIVE_INFINITY;
    if (have + 0.0001 < n.delta) {
      throw new ApiError(
        `${nameOf(n.itemType, n.itemId)} has only ${Number(have.toFixed(3))} left of the ${Number(n.delta.toFixed(3))} this voucher added. It has already been used, so ${voucherNo} cannot be changed.`,
        409,
      );
    }
  }
  const batchRows = new Map<number, Awaited<ReturnType<typeof tx.batch.findUnique>>>();
  for (const b of batches) {
    const row = await tx.batch.findUnique({ where: { id: b.id } });
    batchRows.set(b.id, row);
    if (b.delta > 0.0000001) {
      // This voucher made the batch: it can go only while nothing has been taken from it.
      if (!row || row.status === "DELETED") continue;
      const children = await tx.batch.count({ where: { parentBatchId: row.id, status: { not: "DELETED" } } });
      if (children > 0 || Math.abs(Number(row.availableKg) - Number(row.totalKg)) > 0.0005) {
        throw new ApiError(`${row.batchNo} is already used, so ${voucherNo} cannot be changed.`, 409);
      }
    }
  }

  for (const l of v.stockLedgers) {
    await addLedger(tx, v.id, l.itemType, l.itemId, l.departmentId, { qtyIn: Number(l.qtyOut), qtyOut: Number(l.qtyIn), unit: l.unit });
  }
  for (const b of batches) {
    const row = batchRows.get(b.id);
    if (!row || row.status === "DELETED") continue;
    if (b.delta > 0.0000001) {
      await tx.batch.update({ where: { id: row.id }, data: { status: "DELETED", availableKg: 0, parentBatchId: null } });
    } else if (Math.abs(b.delta) > 0.0000001) {
      // KG that this voucher took from the batch go back to it.
      const left = r4(Number(row.availableKg) - b.delta);
      await tx.batch.update({ where: { id: row.id }, data: { availableKg: left, status: left > 0.0005 ? "READY" : "CONSUMED" } });
    }
  }
  await tx.rejection.deleteMany({ where: { voucherId: v.id } });
  await tx.voucher.update({
    where: { id: v.id },
    data: { status: "VOID", notes: `${what} by ${user.username}.${v.notes ? ` ${v.notes}` : ""}` },
  });
  return v;
}
