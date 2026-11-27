import type { User } from "@prisma/client";
import { ForbiddenError } from "@/lib/auth";
import { ApiError } from "@/lib/api-route";
import { can, isAdmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { showDate, todayISO } from "@/lib/dates";
import { VOUCHER_SECTION, type Action } from "@/lib/permissions";

type U = Pick<User, "role"> & { entryDays?: number | null };

function shiftISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The dates this user may add, edit or delete entries on, or null for no limit (admins, or no days set). */
export function entryWindow(user: U): { min: string; max: string; days: number } | null {
  if (isAdmin(user) || user.entryDays == null) return null;
  const max = todayISO();
  return { min: shiftISO(max, -user.entryDays), max, days: user.entryDays };
}

/** Refuses a date outside the user's window. */
export function assertEntryDate(user: U, date: string | Date) {
  const w = entryWindow(user);
  if (!w) return;
  const iso = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  if (iso > w.max) throw new ForbiddenError("Entries cannot be dated in the future.");
  if (iso < w.min) {
    throw new ForbiddenError(
      w.days === 0
        ? "You can only add or change entries dated today."
        : `You can only add or change entries dated from ${showDate(w.min)} to today (last ${w.days} day${w.days === 1 ? "" : "s"}).`,
    );
  }
}

const POUCH = "Pouch Item";

/** The permission sections a posted voucher belongs to (a dispatch can cover several). */
async function sectionsOf(v: { id: number; voucherType: string }): Promise<string[]> {
  if (v.voucherType === "STORE_PURCHASE" || v.voucherType === "DISPATCH") {
    const lines = await prisma.stockLedger.findMany({ where: { voucherId: v.id }, select: { itemType: true, itemId: true, qtyIn: true, qtyOut: true } });
    const storeIds = [...new Set(lines.filter((l) => l.itemType === "STORE").map((l) => l.itemId))];
    const batchIds = [...new Set(lines.filter((l) => l.itemType === "BATCH").map((l) => l.itemId))];
    const [items, batches] = await Promise.all([
      storeIds.length ? prisma.inventoryItem.findMany({ where: { id: { in: storeIds } }, select: { id: true, group: true } }) : [],
      batchIds.length ? prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, batchType: true } }) : [],
    ]);
    const pouch = (id: number) => items.find((i) => i.id === id)?.group === POUCH;
    if (v.voucherType === "STORE_PURCHASE") {
      return [...new Set(storeIds.map((id) => (pouch(id) ? "materials.pouch" : "materials.store")))];
    }
    const out = new Set<string>();
    for (const l of lines) {
      if (l.itemType === "PRODUCT") out.add("dispatch.fg");
      else if (l.itemType === "RAW") out.add("dispatch.raw");
      else if (l.itemType === "STORE") out.add(pouch(l.itemId) ? "dispatch.pouch" : "dispatch.store");
      else if (l.itemType === "BATCH") out.add(batches.find((b) => b.id === l.itemId)?.batchType === "MASTER" ? "dispatch.master" : "dispatch.final");
    }
    return [...out];
  }
  const s = VOUCHER_SECTION[v.voucherType];
  return s ? (Array.isArray(s) ? s : [s]) : [];
}

/** Checks the user may edit or delete this voucher: the right on every section it covers, and its date in their window. */
export async function assertVoucherRight(user: U, voucherNo: string, action: Exclude<Action, "view">) {
  const v = await prisma.voucher.findUnique({ where: { voucherNo }, select: { id: true, voucherType: true, voucherDate: true } });
  if (!v) throw new ApiError("Voucher not found", 404);
  if (isAdmin(user)) return v;
  const sections = await sectionsOf(v);
  if (sections.length === 0 || !sections.every((s) => can(user, `${s}.${action}`))) {
    throw new ForbiddenError(`You do not have permission to ${action} this entry.`);
  }
  assertEntryDate(user, v.voucherDate);
  return v;
}

/** Same check for a batch, by its id (the mixing page deletes batches by id). */
export async function assertBatchRight(user: U, batchId: number, action: Exclude<Action, "view">) {
  const v = await prisma.voucher.findFirst({ where: { batchId, voucherType: { in: ["MASTER_BATCH", "FINAL_BATCH"] } }, orderBy: { id: "asc" }, select: { voucherNo: true } });
  if (!v) throw new ApiError("Batch not found", 404);
  return assertVoucherRight(user, v.voucherNo, action);
}
