import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { todayISO } from "@/lib/dates";
import { AuthError, ForbiddenError } from "@/lib/auth";

export function jsonError(e: unknown, fallback = "Request failed") {
  if (e instanceof AuthError || e instanceof ForbiddenError) {
    return NextResponse.json({ detail: e.message }, { status: e.status });
  }
  if (e instanceof ApiError) {
    return NextResponse.json({ detail: e.message }, { status: e.status });
  }
  // Form checks (zod): show the first problem as a plain sentence instead of the raw list.
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const field = first?.path?.length ? String(first.path[first.path.length - 1]).replaceAll("_", " ") : "";
    const custom = first && !/^(Invalid|Too small|Too big|Expected)/i.test(first.message);
    const text = !first ? fallback : custom ? first.message : `${field ? `${field[0].toUpperCase()}${field.slice(1)}: ` : ""}${first.message}`;
    return NextResponse.json({ detail: text }, { status: 400 });
  }
  // Database problems: a plain sentence for the screen, the details in the server log.
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const known: Record<string, [string, number]> = {
      P2002: ["This already exists. Use a different name or code.", 409],
      P2003: ["This is still used by other records, so it cannot be changed or deleted.", 409],
      P2025: ["Not found. It may have been deleted already.", 404],
      P2028: ["The database took too long to finish. Try again.", 503],
      P2034: ["Someone else saved at the same moment. Try again.", 409],
      P1001: ["The database cannot be reached right now. Try again in a moment.", 503],
      P1002: ["The database cannot be reached right now. Try again in a moment.", 503],
      P1008: ["The database took too long to answer. Try again.", 503],
      P1017: ["The database connection was closed. Try again.", 503],
      P2024: ["The database is busy right now. Try again in a moment.", 503],
    };
    const hit = known[e.code];
    if (!hit || hit[1] >= 500) console.error("[api] database error", e.code, e.message);
    return NextResponse.json({ detail: hit?.[0] ?? "The database refused this change. Check the values and try again." }, { status: hit?.[1] ?? 400 });
  }
  if (e instanceof Prisma.PrismaClientInitializationError || e instanceof Prisma.PrismaClientRustPanicError || e instanceof Prisma.PrismaClientUnknownRequestError) {
    console.error("[api] database unavailable", e);
    return NextResponse.json({ detail: "The database cannot be reached right now. Try again in a moment." }, { status: 503 });
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    console.error("[api] invalid database query", e.message);
    return NextResponse.json({ detail: "Some values are not valid. Check the form and try again." }, { status: 400 });
  }
  // Programming slips (TypeError and the like) are not shown to users as-is.
  if (e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError || e instanceof SyntaxError) {
    console.error("[api] unexpected error", e);
    return NextResponse.json({ detail: "Something went wrong on the server. Try again, and tell the admin if it keeps happening." }, { status: 500 });
  }
  // Our own checks throw plain Error("sentence for the user").
  if (e instanceof Error) {
    return NextResponse.json({ detail: e.message || fallback }, { status: 400 });
  }
  console.error("[api] unknown error", e);
  return NextResponse.json({ detail: "Something went wrong on the server. Try again." }, { status: 500 });
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function parseISODate(s: string) {
  const d = new Date(s + "T00:00:00.000Z");
  if (Number.isNaN(d.getTime())) throw new ApiError("Invalid date");
  return d;
}

export function todayVoucherSuffix(count: number) {
  const [yy, m, day] = todayISO().split("-");
  const y = Number(yy) % 100;
  return `${y}${m}${day}-${String(count + 1).padStart(4, "0")}`;
}