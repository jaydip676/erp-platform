import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-route";
import { deleteFinalBatch } from "@/lib/erp/transactions";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePerm(req, "mixing.delete");
    const id = z.coerce.number().int().parse((await ctx.params).id);
    return NextResponse.json(await deleteFinalBatch(user, id));
  } catch (e) {
    return jsonError(e);
  }
}
