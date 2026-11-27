import { prisma } from "@/lib/prisma";
import { stockSnapshot } from "@/lib/erp/stock";

function n(v: { toString(): string } | number | null | undefined) {
  return Number(v ?? 0);
}

export async function getPlant(from: Date, to: Date) {
  const [materials, batches, purchases, recent, rejections, products, snapshot, voucherGroups] = await Promise.all([
    prisma.rawMaterial.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.batch.findMany({
      where: { status: "READY", availableKg: { gt: 0 } },
      orderBy: { id: "desc" },
      take: 12,
    }),
    prisma.voucher.findMany({
      where: { voucherType: "PURCHASE", voucherDate: { gte: from, lte: to } },
    }),
    prisma.voucher.findMany({ orderBy: { id: "desc" }, take: 8 }),
    prisma.rejection.findMany({
      // Opening stock rejects are not production of the period.
      where: { rejectionDate: { gte: from, lte: to }, voucher: { status: { not: "VOID" }, voucherType: { not: "OPENING" } } },
      include: { department: true },
    }),
    prisma.product.findMany({ where: { active: true } }),
    stockSnapshot(prisma),
    prisma.voucher.groupBy({
      by: ["voucherType"],
      where: { voucherDate: { gte: from, lte: to } },
      _count: { _all: true },
    }),
  ]);

  const rawBal = new Map<number, number>();
  for (const row of snapshot) {
    if (row.itemType === "RAW" && Math.abs(row.balance) > 0.0005) {
      rawBal.set(row.itemId, (rawBal.get(row.itemId) ?? 0) + row.balance);
    }
  }

  const materialRows = materials.map((m) => {
    const stock = Number((rawBal.get(m.id) ?? 0).toFixed(3));
    const min = n(m.minStock);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      stock_kg: stock,
      min_kg: min,
      short: min > 0 && stock < min,
      empty: stock <= 0,
    };
  });

  const unit = new Map(products.map((p) => [p.id, p.unitWeightKg == null ? 0 : n(p.unitWeightKg)]));
  let fgPcs = 0;
  let fgKg = 0;
  let wipPcs = 0;
  const deptPcs = new Map<string, number>();
  for (const row of snapshot) {
    if (row.itemType !== "PRODUCT" || row.balance <= 0.0005) continue;
    deptPcs.set(row.department, (deptPcs.get(row.department) ?? 0) + row.balance);
    if (row.department === "FG") {
      fgPcs += row.balance;
      fgKg += row.balance * (unit.get(row.itemId) ?? 0);
    } else {
      wipPcs += row.balance;
    }
  }

  const rejectMap = new Map<string, { department: string; repair: number; second: number; scrap: number }>();
  for (const r of rejections) {
    const key = r.department.code;
    const slot = rejectMap.get(key) ?? { department: r.department.name, repair: 0, second: 0, scrap: 0 };
    if (r.rejectionType === "REPAIR") slot.repair += r.quantity;
    else if (r.rejectionType === "SECOND") slot.second += r.quantity;
    else slot.scrap += r.quantity;
    rejectMap.set(key, slot);
  }

  const purchaseKg = purchases.reduce((s, v) => s + n(v.inputQty), 0);
  const master = batches.filter((b) => b.batchType === "MASTER");
  const final = batches.filter((b) => b.batchType === "FINAL");
  const masterKg = master.reduce((s, b) => s + n(b.availableKg), 0);
  const finalKg = final.reduce((s, b) => s + n(b.availableKg), 0);
  const short = materialRows.filter((m) => m.short || m.empty);

  const alerts: { level: "warn" | "info"; text: string; href: string }[] = [];
  if (short.length) alerts.push({ level: "warn", text: `${short.length} raw material${short.length === 1 ? "" : "s"} at or below the minimum`, href: "/materials" });
  if (masterKg <= 0) alerts.push({ level: "info", text: "No ready master batch. Mixing is the next step before extrusion.", href: "/mixing" });
  if (finalKg <= 0) alerts.push({ level: "info", text: "No ready final batch. Extrusion cannot consume compound until one is posted.", href: "/mixing" });
  if (fgPcs <= 0) alerts.push({ level: "info", text: "Finished goods are empty.", href: "/stock" });
  if (purchases.length === 0) alerts.push({ level: "info", text: "No raw-material receipts in this period.", href: "/materials" });

  return {
    material_kg: Number(materialRows.reduce((s, m) => s + m.stock_kg, 0).toFixed(3)),
    material_count: materialRows.length,
    short_count: short.length,
    materials: materialRows.sort((a, b) => Number(b.short) - Number(a.short) || a.stock_kg - b.stock_kg),
    master_kg: masterKg,
    final_kg: finalKg,
    master_count: master.length,
    final_count: final.length,
    batches: batches.map((b) => ({
      batch_no: b.batchNo,
      batch_type: b.batchType,
      available_kg: n(b.availableKg),
      status: b.status,
    })),
    purchase_kg: purchaseKg,
    purchase_count: purchases.length,
    fg_pcs: fgPcs,
    fg_kg: Number(fgKg.toFixed(3)),
    wip_pcs: wipPcs,
    departments: [...deptPcs.entries()].map(([code, pcs]) => ({ code, pcs })).sort((a, b) => b.pcs - a.pcs),
    rejections: [...rejectMap.values()].map((r) => ({ ...r, total: r.repair + r.second + r.scrap })),
    activity: voucherGroups
      .map((g) => ({ type: g.voucherType, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    recent: recent.map((v) => ({
      voucher_no: v.voucherNo,
      type: v.voucherType,
      date: v.voucherDate.toISOString().slice(0, 10),
      input: n(v.inputQty),
      output: n(v.outputQty),
      status: v.status,
    })),
    alerts,
  };
}
