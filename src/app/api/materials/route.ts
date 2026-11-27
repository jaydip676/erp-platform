import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { materialSchema } from "@/lib/schemas";
import { rawMaterialBalance } from "@/lib/erp/stock";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    const materials = await prisma.rawMaterial.findMany({ where: { active: true } });
    const out = await Promise.all(
      materials.map(async (m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        stock_kg: await rawMaterialBalance(prisma, m.id),
      })),
    );
    return NextResponse.json(out);
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.items.edit");
    const body = materialSchema.parse(await req.json());
    const m = await prisma.rawMaterial.create({
      data: { code: body.code, name: body.name, minStock: body.min_stock },
    });
    const existing = await prisma.inventoryItem.findFirst({
      where: { group: "Raw Material", name: body.name },
    });
    if (!existing) {
      const codeTaken = await prisma.inventoryItem.findUnique({ where: { code: body.code } });
      await prisma.inventoryItem.create({
        data: {
          code: codeTaken ? `RM-${body.code}` : body.code,
          name: body.name,
          unit: "KGS",
          group: "Raw Material",
        },
      });
    }
    return NextResponse.json({ id: m.id, code: m.code, name: m.name });
  } catch (e) {
    return jsonError(e);
  }
}