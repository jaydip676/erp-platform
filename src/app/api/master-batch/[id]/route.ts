import { requireUser } from "@/lib/auth";
import { assertBatchRight } from "@/lib/erp/rights";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-route";
import { deleteMasterBatch } from "@/lib/erp/transactions";

type Ctx = { params: Promise<{ id: string }> };

async function batchId(ctx: Ctx) {
  return z.coerce.number().int().parse((await ctx.params).id);
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser(req);
    const id = await batchId(ctx);
    await assertBatchRight(user, id, "delete");
    return NextResponse.json(await deleteMasterBatch(user, id));
  } catch (e) {
    return jsonError(e);
  }
}
