import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, jsonError } from "@/lib/api-route";
import { CORE_GROUPS, STORE_GROUPS, nextNumericCode } from "@/lib/erp/codes";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

function toJson(row: { id: number; code: string; name: string }) {
  return { id: row.id, code: row.code, name: row.name };
}

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return NextResponse.json(
      await cachedMaster(`m:masters/groups${new URL(req.url).search}`, async () => {
      const rows = await prisma.itemGroup.findMany({ where: { active: true }, orderBy: { code: "asc" } });
      return (rows.map(toJson));
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.groups.edit");
    const body = bodySchema.parse(await req.json());
    const existing = await prisma.itemGroup.findFirst({ where: { name: { equals: body.name, mode: "insensitive" } } });
    if (existing?.active) throw new ApiError(`${existing.name} is already a group.`, 409);
    if (existing) {
      const revived = await prisma.itemGroup.update({ where: { id: existing.id }, data: { active: true } });
      return NextResponse.json(toJson(revived));
    }
    const codes = (await prisma.itemGroup.findMany({ select: { code: true } })).map((c) => c.code);
    const row = await prisma.itemGroup.create({ data: { code: nextNumericCode(codes), name: body.name } });
    return NextResponse.json(toJson(row));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePerm(req, "masters.groups.edit");
    const body = bodySchema.extend({ id: z.number().int() }).parse(await req.json());
    const current = await prisma.itemGroup.findUnique({ where: { id: body.id } });
    if (!current) throw new Error("Group not found.");
    if ([...CORE_GROUPS, ...STORE_GROUPS].includes(current.name) && body.name !== current.name) {
      throw new ApiError(`${current.name} is used by the system, so it cannot be renamed.`);
    }
    const row = await prisma.itemGroup.update({
      where: { id: body.id },
      data: { name: body.name },
    });
    if (current.name !== row.name) {
      await prisma.inventoryItem.updateMany({ where: { group: current.name }, data: { group: row.name } });
    }
    return NextResponse.json(toJson(row));
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

export async function DELETE(req: Request) {
  try {
    await requirePerm(req, "masters.groups.delete");
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    const group = await prisma.itemGroup.findFirst({ where: { id, active: true } });
    if (!group) throw new ApiError("Group not found", 404);
    if (CORE_GROUPS.includes(group.name)) throw new ApiError(`${group.name} is used by the system and cannot be deleted.`);
    const used = await prisma.inventoryItem.count({ where: { group: group.name, active: true } });
    if (used > 0) throw new ApiError(`${used} item${used === 1 ? "" : "s"} in Item Master use ${group.name}. Move them to another group first.`);
    await prisma.itemGroup.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}
