import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { finalBatchSchema } from "@/lib/schemas";
import { postFinalBatch } from "@/lib/erp/transactions";

export async function POST(req: Request) {
  try {
    const u = await requirePerm(req, "mixing.final");
    const body = finalBatchSchema.parse(await req.json());
    const result = await postFinalBatch(u, body);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}