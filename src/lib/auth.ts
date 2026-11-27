import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "viaz_token";
const TOKEN_HOURS = 12;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function makeToken(userId: number) {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${TOKEN_HOURS}h`)
    .sign(secret());
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  const sub = payload.sub;
  if (!sub) return null;
  return parseInt(sub, 10);
}

export async function setSessionCookie(token: string, req?: Request) {
  const forwarded = req?.headers.get("x-forwarded-proto");
  const secure = forwarded === "https" || process.env.NODE_ENV === "production";
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: TOKEN_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getTokenFromRequest(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

// Looking the user up is a database trip, and every page and API call needs it. Keep the answer for a short
// while; the Users page clears it whenever a user is changed, so edits still apply at once.
const g = globalThis as unknown as { __userCache?: Map<number, { p: ReturnType<typeof lookupUser>; exp: number }> };
const userCache = (g.__userCache ??= new Map());
export function clearUserCache() {
  userCache.clear();
}
function lookupUser(id: number) {
  return prisma.user.findFirst({ where: { id, active: true, deleted: false } as never });
}
function userById(id: number) {
  const hit = userCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.p;
  const p = lookupUser(id);
  userCache.set(id, { p, exp: Date.now() + 30_000 });
  p.then((u) => { if (!u) userCache.delete(id); }).catch(() => userCache.delete(id));
  return p;
}

export async function getCurrentUser(req?: Request) {
  const token = req ? await getTokenFromRequest(req) : (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const id = await verifyToken(token);
    if (!id) return null;
    // Disabled or deleted users are signed out on their next request.
    return await userById(id);
  } catch {
    return null;
  }
}

export async function requireUser(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) throw new AuthError("Invalid or expired login");
  return user;
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}