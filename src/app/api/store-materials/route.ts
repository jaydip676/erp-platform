import { assertEntryDate } from "@/lib/erp/rights";
import { can, requirePerm } from "@/lib/access";
import { ForbiddenError } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { postStorePurchase } from "@/lib/erp/transactions";
import { STORE_GROUPS } from "@/lib/erp/codes";

/** Packing-store items of one Item Master group (?group=Store Item or Pouch Item) with their current stock. */
export async function GET(req: Request) {
  try {
    await requireUser(req);
    const group = new URL(req.url).searchParams.get("group") || "Store Item";
    if (!STORE_GROUPS.includes(group)) throw new Error("Unknown store group");
    const [items, ledger] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { group, active: true }, orderBy: { code: "asc" } }),
      prisma.stockLedger.groupBy({
        by: ["itemId"],
        where: { itemType: "STORE" },
        _sum: { qtyIn: true, qtyOut: true },
      }),
    ]);
    const balance = new Map(ledger.map((r) => [r.itemId, Number(r._sum.qtyIn ?? 0) - Number(r._sum.qtyOut ?? 0)]));
    const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
    return NextResponse.json(
      items
        .map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, stock: Number((balance.get(i.id) ?? 0).toFixed(4)) }))
        .sort((a, b) => natural(a.code, b.code)),
    );
  } catch (e) {
    return jsonError(e);
  }
}

const receiptSchema = z.object({
  store_item_id: z.number().int(),
  quantity: z.number().positive(),
  date: z.string(),
  reference: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requirePerm(req, "materials.store.edit", "materials.pouch.edit");
    const body = receiptSchema.parse(await req.json());
    const item = await prisma.inventoryItem.findUnique({ where: { id: body.store_item_id }, select: { group: true } });
    if (item && !can(user, item.group === "Pouch Item" ? "materials.pouch.edit" : "materials.store.edit")) {
      throw new ForbiddenError(`You do not have permission to receive ${item.group === "Pouch Item" ? "pouch" : "store"} material.`);
    }
    assertEntryDate(user, body.date);
    return NextResponse.json(await postStorePurchase(user, body));
  } catch (e) {
    return jsonError(e);
  }
}
