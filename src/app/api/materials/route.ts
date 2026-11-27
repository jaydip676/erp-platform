import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { materialSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    // One query for the stock of every material, not one per material.
    const [materials, sums] = await Promise.all([
      prisma.rawMaterial.findMany({ where: { active: true } }),
      prisma.stockLedger.groupBy({ by: ["itemId"], where: { itemType: "RAW" }, _sum: { qtyIn: true, qtyOut: true } }),
    ]);
    const have = new Map(sums.map((s) => [s.itemId, Number(s._sum.qtyIn ?? 0) - Number(s._sum.qtyOut ?? 0)]));
    return NextResponse.json(materials.map((m) => ({ id: m.id, code: m.code, name: m.name, stock_kg: have.get(m.id) ?? 0 })));
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