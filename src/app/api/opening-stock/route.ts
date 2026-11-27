import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { openingStockSchema } from "@/lib/schemas";
import { postOpeningStock } from "@/lib/erp/transactions";
import { listOpenings, openingBulkSchema, postOpeningBulk, voidOpening } from "@/lib/erp/opening";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "masters.opening.view");
    return NextResponse.json(await listOpenings());
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requirePerm(req, "masters.opening.edit");
    const json = await req.json();
    // Many lines at once (the Opening Stock screen), or the older one-line form.
    if (json && Array.isArray(json.lines)) return NextResponse.json(await postOpeningBulk(u, openingBulkSchema.parse(json)));
    return NextResponse.json(await postOpeningStock(u, openingStockSchema.parse(json)));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requirePerm(req, "masters.opening.edit");
    const no = new URL(req.url).searchParams.get("no") ?? "";
    return NextResponse.json(await voidOpening(u, no));
  } catch (e) {
    return jsonError(e);
  }
}
