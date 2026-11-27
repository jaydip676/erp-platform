import { requireAdmin } from "@/lib/access";
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
    const user = await requireAdmin(req);
    return NextResponse.json(await deleteMasterBatch(user, await batchId(ctx)));
  } catch (e) {
    return jsonError(e);
  }
}
