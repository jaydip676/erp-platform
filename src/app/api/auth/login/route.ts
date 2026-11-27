import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/schemas";
import { jsonError } from "@/lib/api-route";
import { makeToken, setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = loginSchema.parse(await req.json());
    const user = await prisma.user.findFirst({
      where: { username: body.username.trim(), active: true, deleted: false } as never,
    });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return NextResponse.json({ detail: "Username or password is incorrect." }, { status: 401 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } as never }).catch(() => undefined);
    const token = await makeToken(user.id);
    await setSessionCookie(token, req);
    return NextResponse.json({
      access_token: token,
      token_type: "bearer",
      username: user.username,
      role: user.role,
    });
  } catch (e) {
    return jsonError(e);
  }
}