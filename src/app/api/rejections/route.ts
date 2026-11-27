import { requirePerm } from "@/lib/access";
import { productName } from "@/lib/erp/product-name";
import { NextResponse } from "next/server";
import { jsonError, parseISODate } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "rejections.view");
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const rows = await prisma.rejection.findMany({
      where: {
        voucher: { status: { not: "VOID" } },
        ...(from || to ? { rejectionDate: { ...(from ? { gte: parseISODate(from) } : {}), ...(to ? { lte: parseISODate(to) } : {}) } } : {}),
      },
      orderBy: [{ rejectionDate: "desc" }, { id: "desc" }],
      take: 2000,
      include: { department: true, product: true, voucher: true },
    });
    return NextResponse.json(
      rows.map((r) => ({
        date: r.rejectionDate.toISOString().slice(0, 10),
        department: r.department.code,
        department_name: r.department.name,
        product: r.product ? (productName(r.product)) : "",
        type: r.rejectionType,
        quantity: r.quantity,
        reason: r.reason,
        voucher_no: r.voucher.voucherNo,
        opening: r.voucher.voucherType === "OPENING",
      })),
    );
  } catch (e) {
    return jsonError(e);
  }
}