import { shownUsername } from "@/lib/permissions";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ForbiddenError, requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { jsonError, parseISODate } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { ITEM_TYPE_NAME, VOUCHER_TYPE_NAME, itemNamer } from "@/lib/erp/labels";

/**
 * The Vouchers page sees everything. Other pages list only their own voucher types
 * (Inward Material its receipts, Production its steps), so those permissions also allow that type.
 */
const TYPE_PERMS: Record<string, string[]> = {
  PURCHASE: ["materials.raw"],
  STORE_PURCHASE: ["materials.store", "materials.pouch"],
  MASTER_BATCH: ["mixing.master"],
  FINAL_BATCH: ["mixing.final"],
  EXTRUSION: ["process.extrusion"],
  CURING: ["process.curing"],
  INSPECTION: ["process.inspection"],
  PACKING: ["process.packing"],
  OPENING: ["masters.opening.view"],
  TRANSFER: ["stock.transfer"],
};
function assertVoucherAccess(user: Parameters<typeof can>[0], type: string | null) {
  if (can(user, "vouchers.view")) return;
  const types = (type ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const ok = types.length > 0 && types.every((t) => (TYPE_PERMS[t] ?? []).some((k) => can(user, k)));
  if (!ok) throw new ForbiddenError("You do not have permission to see these vouchers.");
}

const fmt = (v: number) => Number(v.toFixed(3)).toLocaleString("en-IN");

/**
 * GET /api/vouchers
 *   ?type=PURCHASE,STORE_PURCHASE   only these voucher types
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD  voucher date range
 *   ?q=text                         voucher number contains
 *   ?limit=100                      at most 500
 *   ?no=VOUCHER-NO                  one voucher with its stock movements
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    assertVoucherAccess(user, new URL(req.url).searchParams.get("type"));
    const url = new URL(req.url);
    const p = url.searchParams;
    const nameOf = await itemNamer();

    const one = p.get("no");
    if (one) {
      const v = await prisma.voucher.findUnique({
        where: { voucherNo: one },
        include: { stockLedgers: { include: { department: true }, orderBy: { id: "asc" } }, creator: true },
      });
      if (!v) return NextResponse.json({ detail: "Voucher not found" }, { status: 404 });
      return NextResponse.json({
        voucher_no: v.voucherNo,
        notes: v.notes,
        created_by: v.creator ? shownUsername(v.creator.username) : null,
        created_at: v.createdAt.toISOString(),
        lines: v.stockLedgers.map((l) => ({
          item: nameOf(l.itemType, l.itemId),
          item_type: ITEM_TYPE_NAME[l.itemType] ?? l.itemType,
          department: l.department.name,
          qty_in: Number(l.qtyIn),
          qty_out: Number(l.qtyOut),
          unit: l.unit,
        })),
      });
    }

    const where: Prisma.VoucherWhereInput = {};
    const types = (p.get("type") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length) where.voucherType = { in: types };
    const from = p.get("from");
    const to = p.get("to");
    if (from || to) where.voucherDate = { ...(from ? { gte: parseISODate(from) } : {}), ...(to ? { lte: parseISODate(to) } : {}) };
    const q = p.get("q")?.trim();
    if (q) where.voucherNo = { contains: q, mode: "insensitive" };
    const limit = Math.min(Math.max(Number(p.get("limit") || 100), 1), 500);

    const rows = await prisma.voucher.findMany({
      where,
      orderBy: { id: "desc" },
      take: limit,
      include: { batch: true, product: true, client: true, stockLedgers: { select: { itemType: true, itemId: true, qtyIn: true, qtyOut: true, unit: true } } },
    });
    // Packing: the brand is the one the brand-specific pouches of that voucher belong to.
    const brandOfItem = new Map<number, Set<string>>();
    if (rows.some((v) => v.voucherType === "PACKING")) {
      const brandRules = await prisma.packingConsumption.findMany({
        where: { qualityGradeId: { not: null } },
        select: { itemId: true, qualityGrade: { select: { name: true } } },
      });
      for (const r of brandRules) {
        if (!r.qualityGrade) continue;
        brandOfItem.set(r.itemId, (brandOfItem.get(r.itemId) ?? new Set()).add(r.qualityGrade.name));
      }
    }
    return NextResponse.json(
      rows.map((v) => {
        const brands = new Set<string>();
        if (v.voucherType === "PACKING") {
          for (const l of v.stockLedgers) {
            if (l.itemType === "STORE") for (const b of brandOfItem.get(l.itemId) ?? []) brands.add(b);
          }
        }
        const output = Number(v.outputQty ?? 0);
        const kg = Number(v.consumedKg ?? 0);
        let quantity = "";
        let items = "";
        if (v.voucherType === "MASTER_BATCH" || v.voucherType === "FINAL_BATCH") {
          quantity = `${fmt(Number(v.batch?.totalKg ?? kg))} KG`;
          items = v.batch?.batchNo ?? "";
        } else if (v.voucherType === "DISPATCH") {
          // What went out to the client (the reversing lines of a removed dispatch are left out).
          const byUnit = new Map<string, number>();
          for (const l of v.stockLedgers) {
            const out = Number(l.qtyOut);
            if (out > 0) byUnit.set(l.unit, (byUnit.get(l.unit) ?? 0) + out);
          }
          quantity = [...byUnit].map(([u, n]) => `${fmt(n)} ${u}`).join(" · ");
          items = v.client?.name ?? "";
        } else if (v.voucherType === "EXTRUSION") {
          quantity = `${fmt(output)} PCS · ${fmt(kg)} KG used`;
        } else if (["CURING", "INSPECTION", "PACKING"].includes(v.voucherType)) {
          quantity = `${fmt(output)} PCS`;
        } else {
          // Receipts and opening stock: what came in, per unit, and which items.
          const byUnit = new Map<string, number>();
          const names = new Set<string>();
          for (const l of v.stockLedgers) {
            const qty = Number(l.qtyIn);
            if (qty <= 0) continue;
            byUnit.set(l.unit, (byUnit.get(l.unit) ?? 0) + qty);
            names.add(nameOf(l.itemType, l.itemId));
          }
          quantity = [...byUnit].map(([u, n]) => `${fmt(n)} ${u}`).join(" · ");
          items = [...names].join(", ");
        }
        if (v.product) items = v.product.valveType ? `${v.product.size} / ${v.product.valveType}` : v.product.size;
        return {
          voucher_no: v.voucherNo,
          type_code: v.voucherType,
          type: VOUCHER_TYPE_NAME[v.voucherType] ?? v.voucherType.replaceAll("_", " ").toLowerCase(),
          date: v.voucherDate.toISOString().slice(0, 10),
          input: Number(v.inputQty ?? 0),
          output,
          consumed_kg: kg,
          rework_kg: Number(v.revertKg ?? 0),
          repair: v.repairQty,
          second: v.secondQty,
          scrap: v.scrapQty,
          quantity,
          items,
          brand: v.product?.brand || [...brands].join(", "),
          notes: v.notes,
          status: v.status,
        };
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}
