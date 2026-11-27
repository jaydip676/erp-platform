import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { jsonError, parseISODate } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

type Day = {
  date: string;
  vouchers: number;
  raw_received_kg: number;
  master_kg: number;
  final_kg: number;
  green_tubes: number;
  extrusion_kg: number;
  rework_kg: number;
  pressed: number;
  inspected: number;
  repair: number;
  second: number;
  scrap: number;
  packed: number;
};

/** One row per day: what each department did. Deleted (void) vouchers are left out. */
export async function GET(req: Request) {
  try {
    await requirePerm(req, "reports.view");
    const url = new URL(req.url);
    const from = parseISODate(url.searchParams.get("from_date") ?? "");
    const to = parseISODate(url.searchParams.get("to_date") ?? "");
    const rows = await prisma.voucher.findMany({
      where: { voucherDate: { gte: from, lte: to }, status: { not: "VOID" } },
      include: { batch: true, stockLedgers: { select: { qtyIn: true } } },
      orderBy: { voucherDate: "asc" },
    });
    const days = new Map<string, Day>();
    for (const v of rows) {
      const k = v.voucherDate.toISOString().slice(0, 10);
      let d = days.get(k);
      if (!d) {
        d = { date: k, vouchers: 0, raw_received_kg: 0, master_kg: 0, final_kg: 0, green_tubes: 0, extrusion_kg: 0, rework_kg: 0, pressed: 0, inspected: 0, repair: 0, second: 0, scrap: 0, packed: 0 };
        days.set(k, d);
      }
      d.vouchers += 1;
      const out = Number(v.outputQty ?? 0);
      switch (v.voucherType) {
        case "PURCHASE":
          d.raw_received_kg += v.stockLedgers.reduce((n, l) => n + Number(l.qtyIn), 0);
          break;
        case "MASTER_BATCH":
          d.master_kg += Number(v.batch?.totalKg ?? v.consumedKg ?? 0);
          break;
        case "FINAL_BATCH":
          d.final_kg += Number(v.batch?.totalKg ?? v.consumedKg ?? 0);
          break;
        case "EXTRUSION":
          d.green_tubes += out;
          d.extrusion_kg += Number(v.consumedKg ?? 0) - Number(v.revertKg ?? 0);
          d.rework_kg += Number(v.revertKg ?? 0);
          break;
        case "CURING":
          d.pressed += out;
          break;
        case "INSPECTION":
          d.inspected += out + v.repairQty + v.secondQty + v.scrapQty;
          d.repair += v.repairQty;
          d.second += v.secondQty;
          d.scrap += v.scrapQty;
          break;
        case "PACKING":
          d.packed += out;
          break;
      }
    }
    const r3 = (n: number) => Number(n.toFixed(3));
    return NextResponse.json(
      [...days.values()].map((d) => ({ ...d, raw_received_kg: r3(d.raw_received_kg), master_kg: r3(d.master_kg), final_kg: r3(d.final_kg), extrusion_kg: r3(d.extrusion_kg), rework_kg: r3(d.rework_kg) })),
    );
  } catch (e) {
    return jsonError(e);
  }
}
