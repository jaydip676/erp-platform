import { ZodError } from "zod";
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
  if (e instanceof Error) {
    return NextResponse.json({ detail: e.message || fallback }, { status: 400 });
  }
  return NextResponse.json({ detail: fallback }, { status: 500 });
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