import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

const body = z.object({
  name: z.string().trim().min(1, "Enter the client name.").max(120),
  phone: z.string().trim().max(40).default(""),
  city: z.string().trim().max(80).default(""),
});
const toJson = (c: { id: number; name: string; phone: string; city: string }) => ({ id: c.id, name: c.name, phone: c.phone, city: c.city });

async function assertFree(name: string, exceptId?: number) {
  const same = await prisma.client.findFirst({ where: { active: true, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (same) throw new ApiError(`${same.name} is already a client.`, 409);
}

export async function GET(req: Request) {
  try {
    await requirePerm(req, "dispatch.view");
    return NextResponse.json(
      await cachedMaster(`m:clients${new URL(req.url).search}`, async () => {
      const rows = await prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" } });
      return (rows.map(toJson));
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePerm(req, "dispatch.clients.edit");
    const b = body.parse(await req.json());
    await assertFree(b.name);
    return NextResponse.json(toJson(await prisma.client.create({ data: b })));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePerm(req, "dispatch.clients.edit");
    const b = body.extend({ id: z.number().int() }).parse(await req.json());
    await assertFree(b.name, b.id);
    const { id, ...data } = b;
    return NextResponse.json(toJson(await prisma.client.update({ where: { id }, data })));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

/** A client with past dispatches is kept in the history; it just stops showing in the list. */
export async function DELETE(req: Request) {
  try {
    await requirePerm(req, "dispatch.clients.delete");
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    await prisma.client.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}
