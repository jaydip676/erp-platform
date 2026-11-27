import { prisma } from "@/lib/prisma";
import { stockSnapshot } from "@/lib/erp/stock";
import { getPerformance } from "@/lib/erp/performance";
import { getPlant } from "@/lib/erp/plant";
import { STORE_GROUPS } from "@/lib/erp/codes";

const PRODUCTION_TYPES = ["EXTRUSION", "CURING", "INSPECTION", "PACKING"];
const DAY = 24 * 60 * 60 * 1000;

function n(v: { toString(): string } | number | null | undefined) {
  return Number(v ?? 0);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type DaySeries = {
  date: string;
  gross: number;
  ok: number;
  rejection: number;
  repair: number;
  second: number;
  scrap: number;
  weight_kg: number;
  packed: number;
  purchase_kg: number;
  master_kg: number;
  final_kg: number;
  vouchers: number;
};

/** One row per calendar day in the range, zero when nothing was posted. */
async function dailySeries(from: Date, to: Date): Promise<DaySeries[]> {
  const days = Math.min(Math.round((to.getTime() - from.getTime()) / DAY) + 1, 400);
  const empty = (date: string): DaySeries => ({
    date,
    gross: 0,
    ok: 0,
    rejection: 0,
    repair: 0,
    second: 0,
    scrap: 0,
    weight_kg: 0,
    packed: 0,
    purchase_kg: 0,
    master_kg: 0,
    final_kg: 0,
    vouchers: 0,
  });
  const byDate = new Map<string, DaySeries>();
  for (let i = 0; i < days; i++) {
    const date = iso(new Date(from.getTime() + i * DAY));
    byDate.set(date, empty(date));
  }

  const [vouchers, products] = await Promise.all([
    prisma.voucher.findMany({
      where: {
        voucherDate: { gte: from, lte: to },
        voucherType: { in: [...PRODUCTION_TYPES, "PURCHASE", "MASTER_BATCH", "FINAL_BATCH"] },
        status: { not: "VOID" },
      },
    }),
    prisma.product.findMany({ select: { id: true, unitWeightKg: true } }),
  ]);
  const unit = new Map(products.map((p) => [p.id, p.unitWeightKg == null ? 0 : n(p.unitWeightKg)]));
  const perProduct = new Map<string, { gross: number; rej: number; productId: number; date: string }>();

  for (const v of vouchers) {
    const date = iso(v.voucherDate);
    const day = byDate.get(date);
    if (!day) continue;
    day.vouchers += 1;
    if (v.voucherType === "PURCHASE") day.purchase_kg += n(v.inputQty);
    else if (v.voucherType === "MASTER_BATCH") day.master_kg += n(v.consumedKg);
    else if (v.voucherType === "FINAL_BATCH") day.final_kg += n(v.consumedKg);
    else if (v.productId) {
      const rej = v.repairQty + v.secondQty + v.scrapQty;
      day.repair += v.repairQty;
      day.second += v.secondQty;
      day.scrap += v.scrapQty;
      if (v.voucherType === "EXTRUSION") day.gross += n(v.outputQty);
      if (v.voucherType === "PACKING") day.packed += Math.max(0, n(v.outputQty) - rej);
      const key = `${date}|${v.productId}`;
      const slot = perProduct.get(key) ?? { gross: 0, rej: 0, productId: v.productId, date };
      slot.rej += rej;
      if (v.voucherType === "EXTRUSION") slot.gross += n(v.outputQty);
      perProduct.set(key, slot);
    }
  }
  // Same rule as the performance report: OK = gross - rejections, per size, never below zero.
  for (const slot of perProduct.values()) {
    const day = byDate.get(slot.date);
    if (!day) continue;
    const ok = Math.max(0, slot.gross - slot.rej);
    day.ok += ok;
    day.weight_kg += ok * (unit.get(slot.productId) ?? 0);
  }
  return [...byDate.values()].map((d) => ({ ...d, rejection: d.repair + d.second + d.scrap, weight_kg: Number(d.weight_kg.toFixed(3)) }));
}

export async function getOverview(from: Date, to: Date) {
  const [perf, plant, series, snapshot, storeItems] = await Promise.all([
    getPerformance(from, to),
    getPlant(from, to),
    dailySeries(from, to),
    stockSnapshot(prisma),
    prisma.inventoryItem.findMany({ where: { active: true, group: { in: STORE_GROUPS } } }),
  ]);

  const storeBalance = new Map<number, number>();
  for (const row of snapshot) {
    if (row.itemType === "STORE") storeBalance.set(row.itemId, (storeBalance.get(row.itemId) ?? 0) + row.balance);
  }
  const store = storeItems
    .map((i) => ({
      id: i.id,
      name: i.name,
      group: i.group,
      unit: i.unit,
      stock: Number((storeBalance.get(i.id) ?? 0).toFixed(3)),
    }))
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));

  return { ...perf, series, plant, store };
}
