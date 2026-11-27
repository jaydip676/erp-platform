import { requirePerm } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { assertEntryDate, assertVoucherRight } from "@/lib/erp/rights";
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
    const u = await requirePerm(req, "masters.opening.add");
    const json = await req.json();
    // Many lines at once (the Opening Stock screen), or the older one-line form.
    if (json && Array.isArray(json.lines)) {
      const body = openingBulkSchema.parse(json);
      assertEntryDate(u, body.date);
      return NextResponse.json(await postOpeningBulk(u, body));
    }
    const one = openingStockSchema.parse(json);
    assertEntryDate(u, one.date);
    return NextResponse.json(await postOpeningStock(u, one));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requireUser(req);
    const no = new URL(req.url).searchParams.get("no") ?? "";
    await assertVoucherRight(u, no, "delete");
    return NextResponse.json(await voidOpening(u, no));
  } catch (e) {
    return jsonError(e);
  }
}
