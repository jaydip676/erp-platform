import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: { size: "asc" },
    });
    return NextResponse.json(
      products.map((p) => ({
        id: p.id,
        size: p.size,
        valve_type: p.valveType,
        brand: p.brand,
        unit_weight_kg: p.unitWeightKg ? Number(p.unitWeightKg) : null,
      })),
    );
  } catch (e) {
    return jsonError(e);
  }
}