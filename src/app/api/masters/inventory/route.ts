import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { INVENTORY_UNITS, normalizeInventoryUnit } from "@/lib/erp/units";
import { STORE_GROUPS, findFixedItem } from "@/lib/erp/codes";

const unitSchema = z.string().min(1).transform((value, ctx) => {
  try {
    return normalizeInventoryUnit(value);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "Invalid unit" });
    return z.NEVER;
  }
});

const itemSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1),
  unit: unitSchema,
  unit_qty: z.number().positive().default(1),
  alt_qty: z.number().positive().nullable().optional(),
  alt_unit: z.string().optional().default(""),
  conv_unit: z.string().optional().default("BAG"),
  marking: z.string().optional().default(""),
  item_size: z.string().optional().default(""),
  quality: z.string().optional().default(""),
  cons_qty: z.number().min(0).default(0),
  mfg_use: z.string().optional().default(""),
  group: z.string().trim().min(1).max(80),
});

function alterFields(body: z.infer<typeof itemSchema>) {
  const altUnit = body.alt_unit.trim().toUpperCase();
  const convUnit = (body.conv_unit.trim() || "BAG").toUpperCase();
  if (!(INVENTORY_UNITS as readonly string[]).includes(convUnit)) {
    throw new Error("Alter unit must be BAG, BOX, KGS, LTR, MTR, NOS, PCS, or TON.");
  }
  if (!altUnit && body.alt_qty == null) {
    return { unitQty: body.unit_qty, convUnit, altQty: null, altUnit: "" };
  }
  if (!altUnit || body.alt_qty == null) {
    throw new Error("Alter unit needs both a quantity and a unit, for example 1 BAG = 100 PCS.");
  }
  if (!(INVENTORY_UNITS as readonly string[]).includes(altUnit)) {
    throw new Error("Alter unit must be BAG, BOX, KGS, LTR, MTR, NOS, PCS, or TON.");
  }
  return { unitQty: body.unit_qty, convUnit, altQty: body.alt_qty, altUnit };
}

function toJson(r: {
  id: number;
  code: string;
  name: string;
  unit: string;
  unitQty: number;
  convUnit: string;
  altQty: number | null;
  altUnit: string;
  marking: string;
  itemSize: string;
  quality: string;
  consQty: number;
  mfgUse: string;
  group: string;
}) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    unit: r.unit,
    unit_qty: r.unitQty,
    conv_unit: r.convUnit,
    alt_qty: r.altQty,
    alt_unit: r.altUnit,
    marking: r.marking,
    item_size: r.itemSize,
    quality: r.quality,
    cons_qty: r.consQty,
    mfg_use: r.mfgUse,
    group: r.group,
  };
}

async function withRawId<T extends { code: string; group: string }>(rows: T[]) {
  const raws = await prisma.rawMaterial.findMany();
  const byCode = new Map(raws.map((r) => [r.code, r.id]));
  return rows.map((r) => ({
    ...r,
    raw_material_id: r.group === "Raw Material" ? (byCode.get(r.code) ?? null) : null,
  }));
}

async function assertMasters(group: string, quality: string) {
  const foundGroup = await prisma.itemGroup.findFirst({ where: { name: group, active: true } });
  if (!foundGroup) throw new Error("Add this group in Group Entry before using it on an item.");
  if (quality) {
    const foundQuality = await prisma.qualityGrade.findFirst({ where: { name: quality, active: true } });
    if (!foundQuality) throw new Error("Quality must be a grade from Quality (Grade) Entry.");
  }
}

async function nextItemCode() {
  const [items, raws] = await Promise.all([
    prisma.inventoryItem.findMany({ select: { code: true } }),
    prisma.rawMaterial.findMany({ select: { code: true } }),
  ]);
  const taken = new Set([...items, ...raws].map((r) => r.code));
  let max = 0;
  for (const code of taken) {
    if (/^\d+$/.test(code)) max = Math.max(max, Number(code));
  }
  let next = max + 1;
  while (taken.has(String(next))) next += 1;
  return String(next);
}

async function syncRawMaterial(row: { code: string; name: string; unit: string; group: string }) {
  if (row.group !== "Raw Material") return;
  const unit = row.unit === "KGS" ? "KG" : row.unit;
  const existing = await prisma.rawMaterial.findUnique({ where: { code: row.code } });
  if (!existing) {
    await prisma.rawMaterial.create({ data: { code: row.code, name: row.name, unit } });
    return;
  }
  await prisma.rawMaterial.update({ where: { id: existing.id }, data: { name: row.name, unit } });
}

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return NextResponse.json(
      await cachedMaster(`m:masters/inventory${new URL(req.url).search}`, async () => {
      const group = new URL(req.url).searchParams.get("group");
      const rows = await prisma.inventoryItem.findMany({
        where: { active: true, ...(group ? { group } : {}) },
        orderBy: [{ group: "asc" }, { code: "asc" }],
      });
      return (await withRawId(rows.map(toJson)));
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.items.edit");
    const body = itemSchema.parse(await req.json());
    await assertMasters(body.group, body.quality);
    const alter = alterFields(body);
    const name = body.name.trim();
    const removed = await prisma.inventoryItem.findFirst({ where: { group: body.group, name, active: false } });
    if (removed) {
      // Same name was deleted before: bring it back with its old code instead of hitting the unique name rule.
      const revived = await prisma.inventoryItem.update({
        where: { id: removed.id },
        data: {
          unit: body.unit,
          marking: body.marking,
          itemSize: body.item_size,
          quality: body.quality,
          consQty: body.cons_qty,
          mfgUse: body.mfg_use,
          ...alter,
          active: true,
        },
      });
      await syncRawMaterial(revived);
      if (revived.group === "Raw Material") await prisma.rawMaterial.updateMany({ where: { code: revived.code }, data: { active: true } });
      return NextResponse.json(toJson(revived));
    }
    const row = await prisma.inventoryItem.create({
      data: {
        code: await nextItemCode(),
        name: body.name.trim(),
        unit: body.unit,
        group: body.group,
        marking: body.marking,
        itemSize: body.item_size,
        quality: body.quality,
        consQty: body.cons_qty,
        mfgUse: body.mfg_use,
        ...alter,
      },
    });
    await syncRawMaterial(row);
    return NextResponse.json(toJson(row));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePerm(req, "masters.items.edit");
    const body = itemSchema.extend({ id: z.number().int() }).parse(await req.json());
    await assertMasters(body.group, body.quality);
    const alter = alterFields(body);
    const before = await prisma.inventoryItem.findUnique({ where: { id: body.id } });
    if (!before) throw new ApiError("Item not found", 404);
    const name = body.name.trim();
    const renamed = before.name !== name;
    if (renamed) await assertRename(before, name);
    const bothStore = STORE_GROUPS.includes(before.group) && STORE_GROUPS.includes(body.group);
    if (before.group !== body.group && !bothStore) {
      const used = await blockers(before);
      if (used.length) throw new ApiError(`${before.name} cannot move out of ${before.group}: ${used.join(", ")}.`);
    }
    const row = await prisma.inventoryItem.update({
      where: { id: body.id },
      data: {
        name: body.name.trim(),
        unit: body.unit,
        group: body.group,
        marking: body.marking,
        itemSize: body.item_size,
        quality: body.quality,
        consQty: body.cons_qty,
        mfgUse: body.mfg_use,
        ...alter,
      },
    });
    await syncRawMaterial(row);
    if (renamed) await cascadeRename(before.group, before.name, name);
    return NextResponse.json(toJson(row));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

/**
 * Sizes (Finished Goods) and valves / bags (Store items) are written into other records by name.
 * Refuse a rename that would clash with an existing name there.
 */
async function assertRename(item: { id: number; name: string; group: string }, next: string) {
  const twin = await prisma.inventoryItem.findFirst({ where: { name: next, group: item.group, active: true, id: { not: item.id } } });
  if (twin) throw new ApiError(`${next} already exists in ${item.group}.`, 409);
  const fixed = findFixedItem(item.name);
  if (fixed && findFixedItem(next)?.key !== fixed.key) {
    throw new ApiError(`${item.name} is a fixed packing item that Step 4 finds by name. Keep the name (for example ${fixed.name}).`);
  }
  if (item.group === "Finished Goods") {
    const clash = await prisma.product.findFirst({ where: { size: next } });
    if (clash) throw new ApiError(`Tubes of size ${next} already exist, so ${item.name} cannot be renamed to it.`, 409);
    if (await prisma.sizeMaster.findFirst({ where: { size: next } })) throw new ApiError(`Size ${next} already exists.`, 409);
  } else if (STORE_GROUPS.includes(item.group)) {
    const [mine, theirs] = await Promise.all([
      prisma.product.findMany({ where: { valveType: item.name }, select: { size: true } }),
      prisma.product.findMany({ where: { valveType: next }, select: { size: true } }),
    ]);
    const taken = new Set(theirs.map((p) => p.size));
    const both = mine.find((p) => taken.has(p.size));
    if (both) throw new ApiError(`Size ${both.size} already has tubes with valve ${next}, so ${item.name} cannot be renamed to it.`, 409);
  }
}

/** Carries a size / valve / bag rename into every record that stores the name. */
async function cascadeRename(group: string, from: string, to: string) {
  if (group === "Finished Goods") {
    await prisma.$transaction([
      prisma.product.updateMany({ where: { size: from }, data: { size: to } }),
      prisma.catalogItem.updateMany({ where: { size: from }, data: { size: to } }),
      prisma.packingConsumption.updateMany({ where: { size: from }, data: { size: to } }),
      prisma.sizeMaster.updateMany({ where: { size: from }, data: { size: to } }),
    ]);
  } else if (STORE_GROUPS.includes(group)) {
    await prisma.$transaction([
      prisma.product.updateMany({ where: { valveType: from }, data: { valveType: to } }),
      prisma.catalogItem.updateMany({ where: { valve: from }, data: { valve: to } }),
      prisma.catalogItem.updateMany({ where: { bagItem: from }, data: { bagItem: to } }),
      prisma.sizeValve.updateMany({ where: { valve: from }, data: { valve: to } }),
    ]);
  }
}

/** Reasons an item cannot be deleted. Empty means it is safe to remove. */
async function blockers(item: { id: number; code: string; name: string; group: string }) {
  const found: string[] = [];
  if (item.group === "Raw Material") {
    const raw = await prisma.rawMaterial.findUnique({ where: { code: item.code } });
    if (raw) {
      const [ledger, formulas] = await Promise.all([
        prisma.stockLedger.count({ where: { itemType: "RAW", itemId: raw.id } }),
        prisma.recipeItem.count({ where: { materialId: raw.id, recipe: { active: true } } }),
      ]);
      if (ledger > 0) found.push("it has stock or purchase history");
      if (formulas > 0) found.push(`it is used in ${formulas} batch formula line${formulas === 1 ? "" : "s"}`);
    }
  } else if (STORE_GROUPS.includes(item.group)) {
    const [ledger, rules, products] = await Promise.all([
      prisma.stockLedger.count({ where: { itemType: "STORE", itemId: item.id } }),
      prisma.packingConsumption.count({ where: { itemId: item.id, active: true } }),
      prisma.catalogItem.count({ where: { active: true, OR: [{ valve: item.name }, { bagItem: item.name }] } }),
    ]);
    if (ledger > 0) found.push("it has stock or receipt history");
    if (rules > 0) found.push(`it is used in ${rules} packing rule${rules === 1 ? "" : "s"}`);
    if (products > 0) found.push(`it is used on ${products} product${products === 1 ? "" : "s"} in the Product List`);
  } else if (item.group === "Finished Goods") {
    const [products, vouchers] = await Promise.all([
      prisma.catalogItem.count({ where: { active: true, size: item.name } }),
      prisma.voucher.count({ where: { product: { size: item.name } } }),
    ]);
    if (products > 0) found.push(`it is used on ${products} product${products === 1 ? "" : "s"} in the Product List`);
    if (vouchers > 0) found.push("it has production vouchers");
  }
  return found;
}

export async function DELETE(req: Request) {
  try {
    await requirePerm(req, "masters.items.delete");
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    const item = await prisma.inventoryItem.findFirst({ where: { id, active: true } });
    if (!item) throw new ApiError("Item not found", 404);
    const found = await blockers(item);
    if (found.length) throw new ApiError(`${item.name} cannot be deleted because ${found.join(" and ")}.`);
    await prisma.inventoryItem.update({ where: { id }, data: { active: false } });
    if (item.group === "Raw Material") await prisma.rawMaterial.updateMany({ where: { code: item.code }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}
