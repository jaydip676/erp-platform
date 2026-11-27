import { assertEntryDate } from "@/lib/erp/rights";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { purchaseSchema } from "@/lib/schemas";
import { postPurchase } from "@/lib/erp/transactions";

export async function POST(req: Request) {
  try {
    const u = await requirePerm(req, "materials.raw.add");
    const body = purchaseSchema.parse(await req.json());
    assertEntryDate(u, body.date);
    const result = await postPurchase(u, body);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}