import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-route";
import { dispatchOptions, dispatchSchema, listDispatches, postDispatch, voidDispatch } from "@/lib/erp/dispatch";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "dispatch.view");
    const client = Number(new URL(req.url).searchParams.get("client") || 0) || undefined;
    return NextResponse.json({ options: await dispatchOptions(), history: await listDispatches(client) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requirePerm(req, "dispatch.post");
    return NextResponse.json(await postDispatch(u, dispatchSchema.parse(await req.json())));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requirePerm(req, "dispatch.remove");
    return NextResponse.json(await voidDispatch(u, new URL(req.url).searchParams.get("no") ?? ""));
  } catch (e) {
    return jsonError(e);
  }
}
