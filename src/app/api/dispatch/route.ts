import { can, requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { assertEntryDate, assertVoucherRight } from "@/lib/erp/rights";
import { dispatchOptions, dispatchSchema, listDispatches, postDispatch, voidDispatch } from "@/lib/erp/dispatch";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "dispatch.view");
    const client = Number(new URL(req.url).searchParams.get("client") || 0) || undefined;
    const [options, history] = await Promise.all([dispatchOptions(), listDispatches(client)]);
    return NextResponse.json({ options, history });
  } catch (e) {
    return jsonError(e);
  }
}

const KIND_SECTION = { FG: "dispatch.fg", RAW: "dispatch.raw", MASTER: "dispatch.master", FINAL: "dispatch.final" } as const;

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const body = dispatchSchema.parse(await req.json());
    // Each kind of line needs Edit on its own Dispatch section. Store lines are Store or Pouch by the item's group.
    const storeIds = body.lines.flatMap((l) => (l.kind === "STORE" ? [l.item_id] : []));
    const pouchIds = new Set(
      storeIds.length ? (await prisma.inventoryItem.findMany({ where: { id: { in: storeIds }, group: "Pouch Item" }, select: { id: true } })).map((i) => i.id) : [],
    );
    for (const l of body.lines) {
      const section = l.kind === "STORE" ? (pouchIds.has(l.item_id) ? "dispatch.pouch" : "dispatch.store") : KIND_SECTION[l.kind];
      if (!can(u, `${section}.add`)) throw new ForbiddenError("You do not have permission to dispatch one of these items.");
    }
    assertEntryDate(u, body.date);
    return NextResponse.json(await postDispatch(u, body));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requireUser(req);
    const no = new URL(req.url).searchParams.get("no") ?? "";
    await assertVoucherRight(u, no, "delete");
    return NextResponse.json(await voidDispatch(u, no));
  } catch (e) {
    return jsonError(e);
  }
}
