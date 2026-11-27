import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ApiError, jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { PROCESS_FLOW, type Stage } from "@/lib/erp/flow";
import { departmentItemTotal, productBalance, syncDepartmentNames } from "@/lib/erp/stock";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    await syncDepartmentNames(prisma);
    const url = new URL(req.url);
    if (url.searchParams.get("counts") === "1") {
      // What is waiting for each production step: final batch KG for step 1, pieces for the others.
      const final = await prisma.batch.aggregate({ where: { batchType: "FINAL", status: "READY" }, _sum: { availableKg: true } });
      const out: Record<string, number> = { extrusion: Number(final._sum.availableKg ?? 0) };
      for (const [st, flow] of Object.entries(PROCESS_FLOW)) {
        if (st === "extrusion") continue;
        const dept = await prisma.department.findFirst({ where: { code: flow.source } });
        out[st] = dept ? await departmentItemTotal(prisma, dept.id, "PRODUCT") : 0;
      }
      return NextResponse.json(out);
    }
    const stage = url.searchParams.get("stage") as Stage | null;
    const size = url.searchParams.get("size")?.trim() ?? "";
    let productId = Number(url.searchParams.get("product_id") || 0);
    if (!stage || !(stage in PROCESS_FLOW)) throw new ApiError("Unknown production stage", 404);
    const flow = PROCESS_FLOW[stage];
    if (url.searchParams.get("list") === "1") {
      // Size / valve combinations that currently hold pieces in this step's source department.
      const dept = await prisma.department.findFirst({ where: { code: flow.source } });
      if (!dept) return NextResponse.json([]);
      const rows = await prisma.stockLedger.groupBy({
        by: ["itemId"],
        where: { itemType: "PRODUCT", departmentId: dept.id },
        _sum: { qtyIn: true, qtyOut: true },
      });
      const have = new Map(rows.map((r) => [r.itemId, Number(r._sum.qtyIn ?? 0) - Number(r._sum.qtyOut ?? 0)]));
      const products = await prisma.product.findMany({ where: { active: true, id: { in: [...have.keys()] } }, orderBy: [{ size: "asc" }, { valveType: "asc" }] });
      return NextResponse.json(
        products
          .filter((p) => (have.get(p.id) ?? 0) > 0)
          .map((p) => ({ id: p.id, size: p.size, valve_type: p.valveType, unit_weight_kg: p.unitWeightKg ? Number(p.unitWeightKg) : null, balance: have.get(p.id) ?? 0 })),
      );
    }
    if (stage === "extrusion") {
      return NextResponse.json({
        stage,
        source_department: flow.source,
        target_department: flow.target,
        unit: "KG",
        balance: null,
      });
    }
    if (stage === "curing" && size) {
      const sized = await prisma.product.findFirst({ where: { size, valveType: "", active: true } });
      productId = sized?.id ?? 0;
    }
    if (!productId) {
      return NextResponse.json({
        stage,
        source_department: flow.source,
        target_department: flow.target,
        unit: "PCS",
        balance: 0,
      });
    }
    const dept = await prisma.department.findFirst({ where: { code: flow.source } });
    if (!dept) throw new ApiError("Invalid department");
    return NextResponse.json({
      stage,
      source_department: flow.source,
      target_department: flow.target,
      unit: "PCS",
      balance: await productBalance(prisma, productId, dept.id),
    });
  } catch (e) {
    return jsonError(e);
  }
}
