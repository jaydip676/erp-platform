import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  size: z.string().min(1).optional(),
  add_valve: z.string().min(1).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePerm(req, "masters.products.edit");
    const { id } = await ctx.params;
    const sizeId = Number(id);
    const body = patchSchema.parse(await req.json());
    const current = await prisma.sizeMaster.findUnique({ where: { id: sizeId } });
    if (!current) return NextResponse.json({ detail: "Size not found" }, { status: 404 });

    if (body.size && body.size.trim() !== current.size) {
      const next = body.size.trim();
      await prisma.$transaction([
        prisma.sizeMaster.update({ where: { id: sizeId }, data: { size: next } }),
        prisma.catalogItem.updateMany({ where: { size: current.size }, data: { size: next } }),
      ]);
    }
    if (body.add_valve) {
      const valve = body.add_valve.trim();
      const exists = await prisma.sizeValve.findFirst({ where: { sizeId, valve } });
      if (!exists) await prisma.sizeValve.create({ data: { sizeId, valve } });
    }
    const row = await prisma.sizeMaster.findUnique({ where: { id: sizeId }, include: { valves: true } });
    return NextResponse.json({ id: row?.id, size: row?.size, valves: row?.valves.map((v) => v.valve) ?? [] });
  } catch (e) {
    return jsonError(e);
  }
}
