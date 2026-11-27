import type { User } from "@prisma/client";
import { z } from "zod";
import { ApiError, parseISODate } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { addLedger, productBalance, r4, rawMaterialBalance, storeItemBalance } from "@/lib/erp/stock";
import { PROCESS_FLOW } from "@/lib/erp/flow";
import { finalGroup } from "@/lib/erp/codes";
import { deleteFinalBatch, deleteMasterBatch, deptByCode, isStage, postProcess } from "@/lib/erp/transactions";
import { reverseVoucherTx } from "@/lib/erp/voucher-reverse";
import { voidDispatch } from "@/lib/erp/dispatch";
import { voidGreenTransfer } from "@/lib/erp/transfer";
import { voidOpening } from "@/lib/erp/opening";

const STEPS = ["EXTRUSION", "CURING", "INSPECTION", "PACKING"];
const RECEIPTS = ["PURCHASE", "STORE_PURCHASE"];

/** Admin only. Takes any voucher back out, whatever its type. Stock never goes below zero. */
export async function deleteVoucher(user: User, voucherNo: string) {
  const v = await prisma.voucher.findUnique({ where: { voucherNo }, select: { voucherType: true, status: true, batchId: true } });
  if (!v) throw new ApiError("Voucher not found", 404);
  if (v.status === "VOID") throw new ApiError(`${voucherNo} is already deleted.`, 409);
  switch (v.voucherType) {
    case "MASTER_BATCH":
      if (!v.batchId) throw new ApiError("Batch not found", 404);
      return deleteMasterBatch(user, v.batchId);
    case "FINAL_BATCH":
      if (!v.batchId) throw new ApiError("Batch not found", 404);
      return deleteFinalBatch(user, v.batchId);
    case "DISPATCH":
      return voidDispatch(user, voucherNo);
    case "TRANSFER":
      return voidGreenTransfer(user, voucherNo);
    case "OPENING":
      return voidOpening(user, voucherNo);
    default:
      await prisma.$transaction((tx) => reverseVoucherTx(tx, user, voucherNo));
      return { voucher_no: voucherNo };
  }
}

export const voucherEditSchema = z.object({
  voucher_no: z.string().min(1),
  date: z.string().optional(),
  notes: z.string().nullable().optional(),
  /** Receipts: the quantity received. */
  quantity: z.number().positive().optional(),
  /** Production steps. */
  output_qty: z.number().positive().optional(),
  repair_qty: z.number().int().min(0).optional(),
  second_qty: z.number().int().min(0).optional(),
  scrap_qty: z.number().int().min(0).optional(),
  consumed_kg: z.number().positive().optional(),
  revert_kg: z.number().min(0).optional(),
  final_weight_kg: z.number().positive().nullable().optional(),
});
export type VoucherEdit = z.infer<typeof voucherEditSchema>;

/**
 * Admin only. Receipts keep their number: the quantity is corrected with one extra stock line.
 * Production steps are re-posted with the new numbers (the old voucher is deleted and a new one replaces it)
 * in one transaction. Every other voucher can change its date and notes.
 */
export async function editVoucher(user: User, p: VoucherEdit) {
  const v = await prisma.voucher.findUnique({
    where: { voucherNo: p.voucher_no },
    include: { stockLedgers: true, product: true, batch: true },
  });
  if (!v) throw new ApiError("Voucher not found", 404);
  if (v.status === "VOID") throw new ApiError(`${v.voucherNo} is deleted, so it cannot be edited.`, 409);
  const date = p.date ? parseISODate(p.date) : v.voucherDate;
  const notes = p.notes === undefined ? v.notes : p.notes?.trim() || null;

  if (RECEIPTS.includes(v.voucherType)) {
    const line = v.stockLedgers.find((l) => Number(l.qtyIn) > 0);
    if (!line) throw new ApiError("This receipt has no stock line.");
    const was = Number(v.inputQty);
    const qty = r4(p.quantity ?? was);
    const diff = r4(qty - was);
    return prisma.$transaction(async (tx) => {
      if (diff < 0) {
        const have = line.itemType === "RAW" ? await rawMaterialBalance(tx, line.itemId) : await storeItemBalance(tx, line.itemId);
        if (have + 0.0001 < -diff) {
          throw new ApiError(`Only ${Number(have.toFixed(3))} ${line.unit} is in stock, so this receipt cannot be reduced by ${-diff}. It has already been used.`, 409);
        }
      }
      if (diff !== 0) {
        await addLedger(tx, v.id, line.itemType, line.itemId, line.departmentId, diff > 0 ? { qtyIn: diff, unit: line.unit } : { qtyOut: -diff, unit: line.unit });
      }
      await tx.voucher.update({ where: { id: v.id }, data: { inputQty: qty, voucherDate: date, notes } });
      return { voucher_no: v.voucherNo };
    });
  }

  if (STEPS.includes(v.voucherType)) {
    const stage = v.voucherType.toLowerCase();
    if (!isStage(stage) || !v.productId || !v.product) throw new ApiError("This entry cannot be edited.");
    const flow = PROCESS_FLOW[stage];
    const src = stage === "extrusion" ? undefined : v.stockLedgers.find((l) => l.itemType === "PRODUCT" && Number(l.qtyOut) > 0);
    // The PCS available at the source now, plus what this entry already took from it.
    let input = Number(v.inputQty);
    if (src) {
      const sd = await deptByCode(flow.source);
      input = Math.max(input, (await productBalance(prisma, src.itemId, sd.id)) + Number(src.qtyOut));
    }
    let gradeId: number | null = null;
    if (stage === "packing") {
      const grade = await prisma.qualityGrade.findFirst({ where: { name: v.product.brand } });
      gradeId = grade?.id ?? null;
    }
    const body = {
      date: (p.date ?? v.voucherDate.toISOString().slice(0, 10)),
      product_id: v.productId,
      source_product_id: src?.itemId,
      input_qty: input,
      output_qty: p.output_qty ?? Number(v.outputQty),
      repair_qty: p.repair_qty ?? v.repairQty,
      second_qty: p.second_qty ?? v.secondQty,
      scrap_qty: p.scrap_qty ?? v.scrapQty,
      batch_id: v.batchId,
      final_group: v.batch ? finalGroup(v.batch.batchNo) : undefined,
      machine_id: v.machineId,
      consumed_kg: p.consumed_kg ?? Number(v.consumedKg),
      revert_kg: p.revert_kg ?? Number(v.revertKg),
      quality_grade_id: gradeId,
      final_weight_kg: p.final_weight_kg === undefined ? (v.finalWeightKg == null ? null : Number(v.finalWeightKg)) : p.final_weight_kg,
      notes: (p.notes === undefined ? (v.notes ?? "").replace(/\s*·?\s*Edited from [A-Z0-9-]+/g, "").trim() : p.notes ?? "") || undefined,
    };
    const res = await postProcess(user, stage, body, { replaces: v.voucherNo });
    return { voucher_no: res.voucher_no, replaced: v.voucherNo };
  }

  // Batches, opening stock, transfers and dispatches: their quantities are tied to the stock they moved,
  // so only the date and notes can change. Delete and re-enter to change quantities.
  await prisma.voucher.update({ where: { id: v.id }, data: { voucherDate: date, notes } });
  return { voucher_no: v.voucherNo };
}
