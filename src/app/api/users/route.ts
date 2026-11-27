import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { ApiError, jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/access";
import { normalizePermissions } from "@/lib/permissions";

type Row = {
  id: number;
  username: string;
  role: string;
  active: boolean;
  displayName?: string | null;
  permissions?: unknown;
  deleted?: boolean;
  createdAt?: Date;
  lastLoginAt?: Date | null;
};

const username = z
  .string()
  .trim()
  .min(3, "User ID needs at least 3 characters.")
  .max(40)
  .regex(/^[a-zA-Z0-9._-]+$/, "User ID can use letters, numbers, dot, dash and underscore only.");
const password = z.string().min(6, "Password needs at least 6 characters.").max(100);
const role = z.enum(["admin", "user"]);

function toJson(u: Row) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.displayName ?? "",
    role: u.role === "admin" ? "admin" : "user",
    active: u.active,
    permissions: u.role === "admin" ? [] : normalizePermissions(u.permissions),
    created_at: u.createdAt?.toISOString() ?? null,
    last_login_at: u.lastLoginAt?.toISOString() ?? null,
  };
}

/** Active admins other than this user. There must always be at least one. */
async function otherAdmins(id: number) {
  return prisma.user.count({ where: { role: "admin", active: true, deleted: false, id: { not: id } } as never });
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const rows = (await prisma.user.findMany({ where: { deleted: false } as never, orderBy: { id: "asc" } })) as unknown as Row[];
    return NextResponse.json(rows.map(toJson));
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = z
      .object({
        username,
        password,
        display_name: z.string().trim().max(120).optional().default(""),
        role: role.default("user"),
        permissions: z.array(z.string()).default([]),
      })
      .parse(await req.json());
    const taken = await prisma.user.findFirst({ where: { username: { equals: body.username, mode: "insensitive" } } });
    if (taken) throw new ApiError(`User ID ${body.username} is already used. Choose another.`, 409);
    const row = await prisma.user.create({
      data: {
        username: body.username,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        displayName: body.display_name || null,
        permissions: body.role === "admin" ? [] : normalizePermissions(body.permissions),
      } as never,
    });
    return NextResponse.json(toJson(row as unknown as Row));
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const me = await requireAdmin(req);
    const body = z
      .object({
        id: z.number().int(),
        display_name: z.string().trim().max(120).optional(),
        role: role.optional(),
        permissions: z.array(z.string()).optional(),
        active: z.boolean().optional(),
        password: password.optional(),
      })
      .parse(await req.json());
    const user = (await prisma.user.findFirst({ where: { id: body.id, deleted: false } as never })) as unknown as Row | null;
    if (!user) throw new ApiError("User not found", 404);
    const losingAdmin = user.role === "admin" && ((body.role && body.role !== "admin") || body.active === false);
    if (losingAdmin) {
      if (user.id === me.id) throw new ApiError("You cannot remove your own admin access or disable yourself.");
      if ((await otherAdmins(user.id)) === 0) throw new ApiError("This is the last admin. Make another user admin first.");
    }
    if (body.active === false && user.id === me.id) throw new ApiError("You cannot disable yourself.");
    const nextRole = body.role ?? (user.role === "admin" ? "admin" : "user");
    const data: Record<string, unknown> = {};
    if (body.display_name !== undefined) data.displayName = body.display_name || null;
    if (body.role) data.role = body.role;
    if (body.active !== undefined) data.active = body.active;
    if (body.password) data.passwordHash = await hashPassword(body.password);
    if (body.permissions) data.permissions = nextRole === "admin" ? [] : normalizePermissions(body.permissions);
    const row = await prisma.user.update({ where: { id: user.id }, data: data as never });
    return NextResponse.json(toJson(row as unknown as Row));
  } catch (e) {
    return jsonError(e);
  }
}

/**
 * Deletes a user. Their past vouchers keep their name, so the row stays but is hidden,
 * can never sign in, and the User ID becomes free to use again.
 */
export async function DELETE(req: Request) {
  try {
    const me = await requireAdmin(req);
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    const user = (await prisma.user.findFirst({ where: { id, deleted: false } as never })) as unknown as Row | null;
    if (!user) throw new ApiError("User not found", 404);
    if (user.id === me.id) throw new ApiError("You cannot delete yourself.");
    if (user.role === "admin" && user.active && (await otherAdmins(user.id)) === 0) throw new ApiError("This is the last admin and cannot be deleted.");
    await prisma.user.update({
      where: { id },
      data: { deleted: true, active: false, username: `${user.username}~deleted~${id}`, permissions: [] } as never,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
