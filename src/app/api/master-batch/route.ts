import { assertEntryDate } from "@/lib/erp/rights";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { masterBatchSchema } from "@/lib/schemas";
import { postMasterBatch } from "@/lib/erp/transactions";

export async function POST(req: Request) {
  try {
    const u = await requirePerm(req, "mixing.master.add");
    const body = masterBatchSchema.parse(await req.json());
    assertEntryDate(u, body.date);
    const result = await postMasterBatch(u, body);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}