import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { getDashboard } from "@/lib/erp/transactions";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "dashboard.view");
    return NextResponse.json(await getDashboard());
  } catch (e) {
    return jsonError(e);
  }
}