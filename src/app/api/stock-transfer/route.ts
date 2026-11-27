import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { requireUser } from "@/lib/auth";
import { assertEntryDate, assertVoucherRight } from "@/lib/erp/rights";
import { listGreenTransfers, postGreenTransfer, transferSchema, voidGreenTransfer } from "@/lib/erp/transfer";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "stock.transfer.view");
    return NextResponse.json(await listGreenTransfers());
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requirePerm(req, "stock.transfer.add");
    const body = transferSchema.parse(await req.json());
    assertEntryDate(u, body.date);
    return NextResponse.json(await postGreenTransfer(u, body));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requireUser(req);
    const no = new URL(req.url).searchParams.get("no") ?? "";
    await assertVoucherRight(u, no, "delete");
    return NextResponse.json(await voidGreenTransfer(u, no));
  } catch (e) {
    return jsonError(e);
  }
}
