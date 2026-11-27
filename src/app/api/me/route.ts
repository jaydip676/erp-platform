import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { userPermissions } from "@/lib/access";

export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    return NextResponse.json({ username: u.username, role: u.role, permissions: userPermissions(u) });
  } catch (e) {
    return jsonError(e);
  }
}
