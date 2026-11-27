import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return NextResponse.json(
      await cachedMaster(`m:masters/sizes${new URL(req.url).search}`, async () => {
      const rows = await prisma.sizeMaster.findMany({
        where: { active: true },
        include: { valves: { orderBy: { valve: "asc" } } },
        orderBy: { size: "asc" },
      });
      return (
        rows.map((r) => ({
          id: r.id,
          size: r.size,
          valves: r.valves.map((v) => v.valve),
        }))
      );
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

const createSchema = z.object({
  size: z.string().min(1),
  valves: z.array(z.string().min(1)).optional().default([]),
});

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.products.add");
    const body = createSchema.parse(await req.json());
    const size = body.size.trim();
    const row = await prisma.sizeMaster.create({
      data: {
        size,
        valves: {
          create: [...new Set(body.valves.map((v) => v.trim()).filter(Boolean))].map((valve) => ({ valve })),
        },
      },
      include: { valves: true },
    });
    return NextResponse.json({ id: row.id, size: row.size, valves: row.valves.map((v) => v.valve) });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}
