import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, jsonError } from "@/lib/api-route";
import { nextNumericCode } from "@/lib/erp/codes";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

function toJson(row: { id: number; code: string; name: string }) {
  return { id: row.id, code: row.code, name: row.name };
}

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return NextResponse.json(
      await cachedMaster(`m:masters/qualities${new URL(req.url).search}`, async () => {
      const rows = await prisma.qualityGrade.findMany({ where: { active: true }, orderBy: { code: "asc" } });
      return (rows.map(toJson));
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.qualities.edit");
    const body = bodySchema.parse(await req.json());
    const existing = await prisma.qualityGrade.findFirst({ where: { name: { equals: body.name, mode: "insensitive" } } });
    if (existing?.active) throw new ApiError(`${existing.name} is already a grade.`, 409);
    if (existing) {
      const revived = await prisma.qualityGrade.update({ where: { id: existing.id }, data: { active: true } });
      return NextResponse.json(toJson(revived));
    }
    const codes = (await prisma.qualityGrade.findMany({ select: { code: true } })).map((c) => c.code);
    const row = await prisma.qualityGrade.create({ data: { code: nextNumericCode(codes), name: body.name } });
    return NextResponse.json(toJson(row));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePerm(req, "masters.qualities.edit");
    const body = bodySchema.extend({ id: z.number().int() }).parse(await req.json());
    const current = await prisma.qualityGrade.findUnique({ where: { id: body.id } });
    if (!current) throw new Error("Quality not found.");
    const row = await prisma.qualityGrade.update({
      where: { id: body.id },
      data: { name: body.name },
    });
    if (current.name !== row.name) {
      await prisma.inventoryItem.updateMany({ where: { quality: current.name }, data: { quality: row.name } });
      await prisma.recipeItem.updateMany({ where: { quality: current.name }, data: { quality: row.name } });
      await prisma.product.updateMany({ where: { brand: current.name }, data: { brand: row.name } });
    }
    return NextResponse.json(toJson(row));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function DELETE(req: Request) {
  try {
    await requirePerm(req, "masters.qualities.delete");
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    const grade = await prisma.qualityGrade.findFirst({ where: { id, active: true } });
    if (!grade) throw new ApiError("Quality not found", 404);
    const [items, packing] = await Promise.all([
      prisma.inventoryItem.count({ where: { quality: grade.name, active: true } }),
      prisma.packingConsumption.count({ where: { qualityGradeId: id, active: true } }),
    ]);
    if (items > 0) throw new ApiError(`${items} item${items === 1 ? "" : "s"} in Item Master use ${grade.name}.`);
    if (packing > 0) throw new ApiError(`${packing} packing rule${packing === 1 ? "" : "s"} use ${grade.name}. Remove them in Auto Consumption Packing first.`);
    await prisma.qualityGrade.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}
