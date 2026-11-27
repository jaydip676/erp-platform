import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { isPackingPouch } from "@/lib/erp/units";
import { ALL_SIZES, FIXED_PACKING_ITEMS, STORE_GROUPS, findFixedItem, isPerSizeItem, needsBrand, nextNumericCode } from "@/lib/erp/codes";

const bodySchema = z.object({
  quality_grade_id: z.number().int().nullable().optional(),
  size: z.string().trim().min(1),
  item_id: z.number().int(),
  cons_qty: z.number().min(0),
  export_qty: z.number().min(0).default(0),
});

function toJson(row: {
  id: number;
  size: string;
  consQty: number;
  exportQty: number;
  qualityGrade: { id: number; name: string } | null;
  item: { id: number; name: string; unit: string; group: string };
}) {
  return {
    id: row.id,
    quality_grade_id: row.qualityGrade?.id ?? null,
    quality_name: row.qualityGrade?.name ?? "",
    size: row.size,
    item_id: row.item.id,
    item_name: row.item.name,
    item_group: row.item.group,
    unit: row.item.unit,
    cons_qty: row.consQty,
    export_qty: row.exportQty,
  };
}

const include = { qualityGrade: true, item: true } as const;

async function assertRefs(gradeId: number | null, itemId: number, size: string, ignoreId?: number) {
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, active: true, group: { in: STORE_GROUPS } } });
  if (!item) throw new Error("The item must be a Store Item in Item Master.");
  const pouch = needsBrand(item, isPackingPouch);
  const brandId = pouch ? gradeId : null;
  if (pouch && !brandId) throw new Error(`${item.name} needs a brand, such as viaz or cvaz.`);
  if (brandId) {
    const grade = await prisma.qualityGrade.findFirst({ where: { id: brandId, active: true } });
    if (!grade) throw new Error("Choose a brand from Quality (Grade) Entry.");
  }
  const existing = await prisma.packingConsumption.findFirst({
    where: { size, itemId, qualityGradeId: brandId, active: true, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
  });
  if (existing) throw new Error(pouch ? "This pouch is already set for that size and brand." : "This item is already on this size.");
  return brandId;
}

/**
 * Keeps the fixed items (nut/washer/cap, valve pin, outer bags-100) on every size's list.
 * Each size gets its own row, so the quantity can still be edited per size.
 * Also converts any older all-sizes ("*") rows into one row per size.
 */
async function ensureFixedItemsOnce() {
  const [finished, products, existing] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { active: true, group: "Finished Goods" }, select: { name: true } }),
    prisma.product.findMany({ where: { active: true }, select: { size: true } }),
    prisma.packingConsumption.findMany({ where: { active: true } }),
  ]);

  // Find each fixed item in Item Master, or create it as a Store Item.
  let stockItems = await prisma.inventoryItem.findMany({ where: { active: true, group: { in: STORE_GROUPS } } });
  const usedIds = new Set(existing.map((r) => r.itemId));
  const fixedIds: { id: number; qty: number }[] = [];
  for (const fixed of FIXED_PACKING_ITEMS) {
    const matches = stockItems.filter((i) => findFixedItem(i.name)?.key === fixed.key);
    let item = matches.find((i) => usedIds.has(i.id)) ?? matches[matches.length - 1];
    if (!item) {
      const [codes, rawCodes] = await Promise.all([
        prisma.inventoryItem.findMany({ select: { code: true } }),
        prisma.rawMaterial.findMany({ select: { code: true } }),
      ]);
      item = await prisma.inventoryItem.create({
        data: { code: nextNumericCode([...codes, ...rawCodes].map((c) => c.code)), name: fixed.name, unit: "PCS", group: "Store Item" },
      });
      stockItems = [...stockItems, item];
    }
    fixedIds.push({ id: item.id, qty: fixed.qty });
  }

  const sizes = new Set<string>([
    ...finished.map((r) => r.name),
    ...products.map((r) => r.size),
  ]);
  sizes.delete("");

  const have = new Set(existing.filter((r) => r.size !== ALL_SIZES).map((r) => `${r.size}|${r.itemId}|${r.qualityGradeId ?? ""}`));
  const toCreate: { size: string; itemId: number; qualityGradeId: number | null; consQty: number; exportQty: number }[] = [];
  const add = (size: string, itemId: number, qualityGradeId: number | null, consQty: number, exportQty: number) => {
    const key = `${size}|${itemId}|${qualityGradeId ?? ""}`;
    if (have.has(key)) return;
    have.add(key);
    toCreate.push({ size, itemId, qualityGradeId, consQty, exportQty });
  };

  const legacy = existing.filter((r) => r.size === ALL_SIZES);
  const perSizeIds = new Set(stockItems.filter((i) => isPerSizeItem(i.name)).map((i) => i.id));
  for (const rule of legacy) {
    if (perSizeIds.has(rule.itemId)) continue;
    for (const size of sizes) add(size, rule.itemId, rule.qualityGradeId, rule.consQty, rule.exportQty);
  }
  // Outer Bags-100 and -50 are never added to sizes automatically; the user picks their sizes.
  const autoAdded: number[] = [];
  for (const fixed of fixedIds) {
    if (perSizeIds.has(fixed.id)) continue;
    for (const size of sizes) add(size, fixed.id, null, fixed.qty, fixed.qty);
  }

  // Remove the old automatic rows of Outer Bags-100/-50: every size, still at the default qty.
  for (const fixed of fixedIds) {
    if (!perSizeIds.has(fixed.id)) continue;
    const mine = existing.filter((r) => r.itemId === fixed.id);
    const untouched =
      mine.length > 0 &&
      mine.every((r) => r.size !== ALL_SIZES && Math.abs(r.consQty - fixed.qty) < 1e-9) &&
      [...sizes].every((size) => mine.some((r) => r.size === size));
    if (untouched) autoAdded.push(...mine.map((r) => r.id));
  }
  if (autoAdded.length) await prisma.packingConsumption.deleteMany({ where: { id: { in: autoAdded } } });
  if (toCreate.length) await prisma.packingConsumption.createMany({ data: toCreate });
  if (legacy.length) await prisma.packingConsumption.deleteMany({ where: { size: ALL_SIZES } });
}

// Requests can arrive together (page load twice in development). Run one at a time so rows are not doubled.
let ensuring: Promise<void> = Promise.resolve();
let lastEnsured = 0;
function ensureFixedItems() {
  // The check reads several tables; once every few minutes is enough, and saving a rule changes nothing it fixes.
  if (Date.now() - lastEnsured < 5 * 60_000) return ensuring;
  lastEnsured = Date.now();
  const run = ensuring.then(ensureFixedItemsOnce);
  ensuring = run.catch(() => undefined);
  return run;
}

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return NextResponse.json(
      await cachedMaster(`m:masters/packing${new URL(req.url).search}`, async () => {
      await ensureFixedItems();
      const rows = await prisma.packingConsumption.findMany({
        where: { active: true },
        include,
        orderBy: [{ size: "asc" }, { qualityGradeId: "asc" }, { item: { name: "asc" } }],
      });
      return (rows.map(toJson));
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.packing.edit");
    const body = bodySchema.parse(await req.json());
    const gradeId = await assertRefs(body.quality_grade_id ?? null, body.item_id, body.size);
    const row = await prisma.packingConsumption.create({
      data: {
        qualityGradeId: gradeId,
        size: body.size,
        itemId: body.item_id,
        consQty: body.cons_qty,
        exportQty: body.export_qty,
      },
      include,
    });
    return NextResponse.json(toJson(row));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePerm(req, "masters.packing.edit");
    const body = bodySchema.extend({ id: z.number().int() }).parse(await req.json());
    const gradeId = await assertRefs(body.quality_grade_id ?? null, body.item_id, body.size, body.id);
    const row = await prisma.packingConsumption.update({
      where: { id: body.id },
      data: {
        qualityGradeId: gradeId,
        size: body.size,
        itemId: body.item_id,
        consQty: body.cons_qty,
        exportQty: body.export_qty,
      },
      include,
    });
    return NextResponse.json(toJson(row));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function DELETE(req: Request) {
  try {
    await requirePerm(req, "masters.packing.edit");
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    const row = await prisma.packingConsumption.findUnique({ where: { id }, include: { item: true } });
    if (!row) throw new Error("Packing item not found.");
    if (findFixedItem(row.item.name) && !isPerSizeItem(row.item.name) && row.qualityGradeId == null) {
      throw new Error(`${row.item.name} is fixed for every size and cannot be removed. You can change its quantity.`);
    }
    await prisma.packingConsumption.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

const ruleSchema = z.object({
  brand_ids: z.array(z.number().int()).default([]),
  sizes: z.array(z.string().trim().min(1)).default([]),
  cons_qty: z.number().min(0),
  export_qty: z.number().min(0).default(0),
});

/**
 * Saves every packing rule of one item at once.
 * A rule is "these sizes, these brands, this qty per piece"; it is stored as one row per size and brand.
 */
export async function PUT(req: Request) {
  try {
    await requirePerm(req, "masters.packing.edit");
    const body = z.object({ item_id: z.number().int(), rules: z.array(ruleSchema) }).parse(await req.json());
    const item = await prisma.inventoryItem.findFirst({ where: { id: body.item_id, active: true, group: { in: STORE_GROUPS } } });
    if (!item) throw new Error("The item must be a Pouch Material or Store Item in Item Master.");
    const branded = needsBrand(item, isPackingPouch);
    const grades = new Set((await prisma.qualityGrade.findMany({ where: { active: true }, select: { id: true } })).map((g) => g.id));

    const seen = new Set<string>();
    const data: { size: string; itemId: number; qualityGradeId: number | null; consQty: number; exportQty: number }[] = [];
    for (const rule of body.rules) {
      if (rule.sizes.length === 0) continue;
      const brands = branded ? [...new Set(rule.brand_ids)] : [null];
      if (branded && brands.length === 0) throw new Error(`${item.name} needs at least one brand for the selected sizes.`);
      for (const id of brands) if (id != null && !grades.has(id)) throw new Error("Choose brands from Quality (Grade) Entry.");
      for (const size of [...new Set(rule.sizes)]) {
        for (const brand of brands) {
          const key = `${size}|${brand ?? ""}`;
          if (seen.has(key)) throw new Error(`${size} is listed in two rules for ${item.name}. Keep it in one rule.`);
          seen.add(key);
          data.push({ size, itemId: item.id, qualityGradeId: brand, consQty: rule.cons_qty, exportQty: rule.export_qty });
        }
      }
    }

    await prisma.$transaction([
      prisma.packingConsumption.deleteMany({ where: { itemId: item.id } }),
      prisma.packingConsumption.createMany({ data }),
    ]);
    return NextResponse.json({ ok: true, rows: data.length });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

