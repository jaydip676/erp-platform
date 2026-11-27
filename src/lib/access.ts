import type { User } from "@prisma/client";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { ALL_PERMISSIONS, normalizePermissions } from "@/lib/permissions";

export const isAdmin = (user: Pick<User, "role">) => user.role === "admin";

/** Every permission the user has. Admins have all of them. */
export function userPermissions(user: Pick<User, "role">): string[] {
  if (isAdmin(user)) return [...ALL_PERMISSIONS];
  return normalizePermissions((user as unknown as { permissions?: unknown }).permissions);
}

export function can(user: Pick<User, "role">, key: string) {
  return isAdmin(user) || userPermissions(user).includes(key);
}

/** The signed-in user, when they have at least one of the permissions; otherwise a 403. */
export async function requirePerm(req: Request, ...keys: string[]) {
  const user = await requireUser(req);
  if (isAdmin(user)) return user;
  const mine = userPermissions(user);
  if (!keys.some((k) => mine.includes(k))) throw new ForbiddenError("You do not have permission for this.");
  return user;
}

export async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  if (!isAdmin(user)) throw new ForbiddenError("Only an admin can do this.");
  return user;
}
