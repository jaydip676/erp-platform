import { requireUser } from "@/lib/auth";
import { assertBatchRight } from "@/lib/erp/rights";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-route";
import { deleteFinalBatch } from "@/lib/erp/transactions";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const id = z.coerce.number().int().parse((await ctx.params).id);
    await assertBatchRight(user, id, "delete");
    return NextResponse.json(await deleteFinalBatch(user, id));
  } catch (e) {
    return jsonError(e);
  }
}
