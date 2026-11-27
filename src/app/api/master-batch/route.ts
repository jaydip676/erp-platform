import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { masterBatchSchema } from "@/lib/schemas";
import { postMasterBatch } from "@/lib/erp/transactions";

export async function POST(req: Request) {
  try {
    const u = await requirePerm(req, "mixing.master");
    const body = masterBatchSchema.parse(await req.json());
    const result = await postMasterBatch(u, body);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}