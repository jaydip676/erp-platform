import { assertEntryDate } from "@/lib/erp/rights";
import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/access";
import { ApiError, jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { segmentForSize } from "@/lib/erp/segments";
import { processSchema } from "@/lib/schemas";
import { postProcess } from "@/lib/erp/transactions";

async function productIdForSize(size: string, valve = "", create = true, brand = "") {
  const item = await prisma.inventoryItem.findFirst({
    where: { group: "Finished Goods", name: size, active: true },
  });
  if (!item) throw new ApiError("Size must be a Finished Goods row in Item Master.");
  if (valve) {
    const store = await prisma.inventoryItem.findFirst({
      where: { group: "Store Item", name: valve, active: true },
    });
    if (!store) throw new ApiError("Valve must be a Store Item in Item Master.");
  }
  const existing = await prisma.product.findFirst({ where: { size, valveType: valve, brand, active: true } });
  if (existing) return existing.id;
  if (!create) throw new ApiError(`No green tubes are in extrusion for ${size}.`);
  const created = await prisma.product.create({
    data: { size, valveType: valve, brand, segment: segmentForSize(size) },
  });
  return created.id;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ stage: string }> },
) {
  try {
    const { stage } = await ctx.params;
    const u = await requirePerm(req, `process.${stage}.edit`);
    const body = processSchema.parse(await req.json());
    assertEntryDate(u, body.date);
    let productId = body.product_id;
    let sourceProductId: number | undefined;
    if (stage === "extrusion") {
      if (!body.size) throw new ApiError("Select a size.");
      productId = await productIdForSize(body.size);
    } else if (stage === "curing") {
      if (!body.size) throw new ApiError("Select a size.");
      if (!body.valve) throw new ApiError("Select a valve.");
      sourceProductId = await productIdForSize(body.size, "", false);
      productId = await productIdForSize(body.size, body.valve);
    } else if (!productId) {
      throw new ApiError("Select a size.");
    } else if (stage === "packing") {
      // Packed goods are kept by size, valve and brand. The pieces come from the unbranded inspected stock.
      if (!body.quality_grade_id) throw new ApiError("Select the brand.");
      const grade = await prisma.qualityGrade.findUnique({ where: { id: body.quality_grade_id } });
      if (!grade || !grade.active) throw new ApiError("Select the brand.");
      const source = await prisma.product.findUnique({ where: { id: productId } });
      if (!source) throw new ApiError("Product not found", 404);
      sourceProductId = source.id;
      productId = await productIdForSize(source.size, source.valveType, true, grade.name);
    }
    if (!productId) throw new ApiError("Select a size.");
    const result = await postProcess(u, stage, { ...body, product_id: productId, source_product_id: sourceProductId });
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}