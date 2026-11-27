import { prisma } from "@/lib/prisma";
import { WIP_DEPARTMENTS } from "@/lib/erp/flow";
import { SEGMENT_ORDER, segmentForSize } from "@/lib/erp/segments";

const PRODUCTION_TYPES = ["EXTRUSION", "CURING", "INSPECTION", "PACKING"];

export type PerformanceRow = {
  product_id: number;
  size: string;
  valve: string;
  segment: string;
  gross: number;
  repair: number;
  second: number;
  scrap: number;
  rejection: number;
  ok: number;
  unit_kg: number | null;
  weight_kg: number;
  yield_pct: number | null;
  valves_fitted: number;
};

function n(v: { toString(): string } | number | null | undefined) {
  return Number(v ?? 0);
}

function pack(rows: PerformanceRow[]) {
  const gross = rows.reduce((s, r) => s + r.gross, 0);
  const ok = rows.reduce((s, r) => s + r.ok, 0);
  const repair = rows.reduce((s, r) => s + r.repair, 0);
  const second = rows.reduce((s, r) => s + r.second, 0);
  const scrap = rows.reduce((s, r) => s + r.scrap, 0);
  const rejection = repair + second + scrap;
  const weight = rows.reduce((s, r) => s + r.weight_kg, 0);
  const running = rows.filter((r) => r.gross > 0 || r.rejection > 0).length;
  return {
    ok_pcs: ok,
    gross_pcs: gross,
    yield_pct: gross > 0 ? (ok / gross) * 100 : 0,
    weight_kg: weight,
    avg_unit_kg: ok > 0 ? weight / ok : 0,
    running_sizes: running,
    repair,
    second,
    scrap,
    rejection,
    rejection_pct: gross > 0 ? (rejection / gross) * 100 : 0,
  };
}

async function rowsForRange(from: Date, to: Date): Promise<PerformanceRow[]> {
  const [products, vouchers] = await Promise.all([
    prisma.product.findMany({ where: { active: true, brand: "" }, orderBy: [{ size: "asc" }, { valveType: "asc" }] }),
    prisma.voucher.findMany({
      where: {
        voucherDate: { gte: from, lte: to },
        productId: { not: null },
        voucherType: { in: PRODUCTION_TYPES },
      },
    }),
  ]);

  const byProduct = new Map<number, PerformanceRow>();
  for (const p of products) {
    byProduct.set(p.id, {
      product_id: p.id,
      size: p.size,
      valve: p.valveType,
      segment: p.segment || segmentForSize(p.size),
      gross: 0,
      repair: 0,
      second: 0,
      scrap: 0,
      rejection: 0,
      ok: 0,
      unit_kg: p.unitWeightKg == null ? null : n(p.unitWeightKg),
      weight_kg: 0,
      yield_pct: null,
      valves_fitted: 0,
    });
  }

  for (const v of vouchers) {
    if (!v.productId) continue;
    const row = byProduct.get(v.productId);
    if (!row) continue;
    row.repair += v.repairQty;
    row.second += v.secondQty;
    row.scrap += v.scrapQty;
    if (v.voucherType === "EXTRUSION") row.gross += n(v.outputQty);
  }

  for (const row of byProduct.values()) {
    row.rejection = row.repair + row.second + row.scrap;
    row.ok = Math.max(0, row.gross - row.rejection);
    row.weight_kg = row.unit_kg == null ? 0 : Number((row.ok * row.unit_kg).toFixed(3));
    row.yield_pct = row.gross > 0 ? (row.ok / row.gross) * 100 : null;
    if (row.valves_fitted === 0 && row.ok > 0) row.valves_fitted = row.ok;
  }

  return [...byProduct.values()];
}

export async function getPerformance(from: Date, to: Date) {
  const span = Math.max(to.getTime() - from.getTime(), 0);
  const prevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - span);

  // Everything is asked in one round of queries: each trip to the database is slow.
  const [rows, previousRows, depts, deptSums, masterKg, finalKg] = await Promise.all([
    rowsForRange(from, to),
    rowsForRange(prevFrom, prevTo),
    prisma.department.findMany(),
    prisma.stockLedger.groupBy({ by: ["departmentId"], where: { itemType: "PRODUCT" }, _sum: { qtyIn: true, qtyOut: true } }),
    prisma.batch.aggregate({ where: { batchType: "MASTER", status: "READY" }, _sum: { availableKg: true } }),
    prisma.batch.aggregate({ where: { batchType: "FINAL", status: "READY" }, _sum: { availableKg: true } }),
  ]);
  const kpis = pack(rows);
  const previous = pack(previousRows);

  const top = [...rows].filter((r) => r.ok > 0).sort((a, b) => b.ok - a.ok || b.weight_kg - a.weight_kg).slice(0, 8);

  const segments = SEGMENT_ORDER.map((name) => {
    const ok_pcs = rows.filter((r) => r.segment === name).reduce((s, r) => s + r.ok, 0);
    return { name, ok_pcs, share: kpis.ok_pcs > 0 ? (ok_pcs / kpis.ok_pcs) * 100 : 0 };
  });

  const valveMap = new Map<string, number>();
  for (const row of rows) {
    if (row.valves_fitted <= 0) continue;
    valveMap.set(row.valve, (valveMap.get(row.valve) ?? 0) + row.valves_fitted);
  }
  const valves = [...valveMap.entries()]
    .map(([valve, units]) => ({ valve, units }))
    .sort((a, b) => b.units - a.units);

  const pipeline = WIP_DEPARTMENTS.map(([code, name]) => {
    const d = depts.find((x) => x.code === code);
    const sum = d ? deptSums.find((x) => x.departmentId === d.id)?._sum : undefined;
    return { code, name, pcs: Number(sum?.qtyIn ?? 0) - Number(sum?.qtyOut ?? 0) };
  });

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    catalog: rows.length,
    kpis,
    previous,
    top,
    segments,
    valves,
    rows: rows.sort((a, b) => b.ok - a.ok || a.size.localeCompare(b.size)),
    pipeline,
    master_batch_kg: n(masterKg._sum.availableKg),
    final_batch_kg: n(finalKg._sum.availableKg),
  };
}
