import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { formulaTag } from "@/lib/erp/codes";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return NextResponse.json(
      await cachedMaster(`m:masters/batches${new URL(req.url).search}`, async () => {
      const rows = await prisma.recipe.findMany({
        where: { active: true },
        include: { items: { include: { material: true } } },
        orderBy: { code: "asc" },
      });
      return (
        rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          batch_type: r.batchType,
          master_kg: r.masterKg,
          total_kg: r.items.reduce((s, i) => s + Number(i.kgPerBatch), 0),
          items: r.items.map((i) => ({
            material_id: i.materialId,
            code: i.material.code,
            name: i.material.name,
            kg: Number(i.kgPerBatch),
            unit: "KGS",
            marking: i.marking,
            size: i.itemSize,
            quality: i.quality,
            mfg_use: i.mfgUse,
          })),
        }))
      );
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

/** Next free code in the BM-0001, BM-0002 ... sequence. Deleted formulas keep their number, so it is never reused. */
async function nextCode() {
  const rows = await prisma.recipe.findMany({ select: { code: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^BM-(\d+)$/.exec(r.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `BM-${String(max + 1).padStart(4, "0")}`;
}

const createSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1),
  batch_type: z.enum(["MASTER", "FINAL"]),
  master_kg: z.number().positive().optional().default(60),
  items: z.array(z.object({
    material_id: z.number().int(),
    kg: z.number().positive(),
    marking: z.string().optional().default(""),
    size: z.string().optional().default(""),
    quality: z.string().optional().default(""),
    mfg_use: z.string().optional().default(""),
  })).min(1),
});

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.batches.add");
    const body = createSchema.parse(await req.json());
    const code = await nextCode();
    const existing = null as null | { id: number };
    if (existing) {
      // The code belonged to a deleted formula: replace it instead of failing on the unique code.
      const revived = await prisma.$transaction(async (tx) => {
        await tx.recipeItem.deleteMany({ where: { recipeId: existing.id } });
        return tx.recipe.update({
          where: { id: existing.id },
          data: {
            name: body.name.trim(),
            batchType: body.batch_type,
            masterKg: body.master_kg,
            active: true,
            items: {
              create: body.items.map((i) => ({
                materialId: i.material_id,
                kgPerBatch: i.kg,
                marking: i.marking,
                itemSize: i.size,
                quality: i.quality,
                mfgUse: i.mfg_use,
              })),
            },
          },
        });
      });
      return NextResponse.json({ id: revived.id, code: revived.code });
    }
    const row = await prisma.recipe.create({
      data: {
        code,
        name: body.name.trim(),
        batchType: body.batch_type,
        masterKg: body.master_kg,
        items: {
          create: body.items.map((i) => ({
            materialId: i.material_id,
            kgPerBatch: i.kg,
            marking: i.marking,
            itemSize: i.size,
            quality: i.quality,
            mfgUse: i.mfg_use,
          })),
        },
      },
    });
    return NextResponse.json({ id: row.id, code: row.code });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

/** Removes a saved formula from the list. Posted batches are not affected. */
export async function DELETE(req: Request) {
  try {
    await requirePerm(req, "masters.batches.delete");
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    const recipe = await prisma.recipe.findFirst({ where: { id, active: true } });
    if (!recipe) throw new ApiError("Batch formula not found", 404);
    await prisma.recipe.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePerm(req, "masters.batches.edit");
    const body = createSchema.extend({ id: z.number().int() }).parse(await req.json());
    const current = await prisma.recipe.findFirst({ where: { id: body.id, active: true } });
    if (!current) throw new ApiError("Batch formula not found", 404);
    const code = current.code;
    const materialIds = body.items.map((i) => i.material_id);
    if (new Set(materialIds).size !== materialIds.length) throw new ApiError("A material is listed twice. Combine the KG on one line.");
    // Batch numbers carry the formula name (MB-MASTERV2-..., FB-FINALV2-MB-MASTERV2-...).
    // On a rename, the batches already made move to the new name so they stay in one group.
    const oldTag = formulaTag(current);
    const newTag = formulaTag({ name: body.name.trim(), code });
    if (oldTag !== newTag) {
      const others = await prisma.recipe.findMany({ where: { active: true, id: { not: body.id } }, select: { name: true, code: true } });
      if (others.some((r) => formulaTag(r) === newTag)) throw new ApiError(`Another formula already uses the name ${body.name.trim()}.`, 409);
    }
    const row = await prisma.$transaction(async (tx) => {
      if (oldTag !== newTag) {
        const isMaster = (current.batchType || "MASTER") === "MASTER";
        const pattern = isMaster ? [`MB-${oldTag}-`, `-MB-${oldTag}-`] : [`FB-${oldTag}-`];
        const batches = await tx.batch.findMany({ where: { OR: pattern.map((p) => ({ batchNo: { contains: p } })) }, select: { id: true, batchNo: true } });
        for (const b of batches) {
          let next = b.batchNo;
          if (isMaster) {
            if (next.startsWith(`MB-${oldTag}-`)) next = `MB-${newTag}-` + next.slice(`MB-${oldTag}-`.length);
            next = next.replace(`-MB-${oldTag}-`, `-MB-${newTag}-`);
          } else if (next.startsWith(`FB-${oldTag}-`)) {
            next = `FB-${newTag}-` + next.slice(`FB-${oldTag}-`.length);
          }
          if (next !== b.batchNo) await tx.batch.update({ where: { id: b.id }, data: { batchNo: next } });
        }
      }
      await tx.recipeItem.deleteMany({ where: { recipeId: body.id } });
      return tx.recipe.update({
        where: { id: body.id },
        data: {
          code,
          name: body.name.trim(),
          batchType: body.batch_type,
          masterKg: body.master_kg,
          items: {
            create: body.items.map((i) => ({
              materialId: i.material_id,
              kgPerBatch: i.kg,
              marking: i.marking,
              itemSize: i.size,
              quality: i.quality,
              mfgUse: i.mfg_use,
            })),
          },
        },
      });
    });
    return NextResponse.json({ id: row.id, code: row.code });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}
