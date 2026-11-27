import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { todayISO } from "@/lib/dates";
import { jsonError, parseISODate } from "@/lib/api-route";
import { getOverview } from "@/lib/erp/overview";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "dashboard.view");
    const url = new URL(req.url);
    const today = todayISO();
    const from = parseISODate(url.searchParams.get("from") || today);
    const to = parseISODate(url.searchParams.get("to") || today);
    if (from > to) return NextResponse.json({ detail: "From date is after to date" }, { status: 400 });
    return NextResponse.json(await getOverview(from, to));
  } catch (e) {
    return jsonError(e);
  }
}
