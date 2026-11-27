import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { listGreenTransfers, postGreenTransfer, transferSchema, voidGreenTransfer } from "@/lib/erp/transfer";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "stock.transfer");
    return NextResponse.json(await listGreenTransfers());
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requirePerm(req, "stock.transfer");
    return NextResponse.json(await postGreenTransfer(u, transferSchema.parse(await req.json())));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requirePerm(req, "stock.transfer.remove");
    return NextResponse.json(await voidGreenTransfer(u, new URL(req.url).searchParams.get("no") ?? ""));
  } catch (e) {
    return jsonError(e);
  }
}
