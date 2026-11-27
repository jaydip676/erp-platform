import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    const params = new URL(req.url).searchParams;
    const type = params.get("type");
    // all=1 lists every batch that was made and not deleted, including ones with nothing left.
    const all = params.get("all") === "1";
    const rows = await prisma.batch.findMany({
      where: {
        ...(all ? { status: { in: ["READY", "CONSUMED"] } } : { status: "READY", availableKg: { gt: 0 } }),
        ...(type === "MASTER" || type === "FINAL" ? { batchType: type } : {}),
      },
      include: { parentBatch: true, vouchers: { select: { voucherDate: true, notes: true }, orderBy: { id: "asc" }, take: 1 } },
      orderBy: { id: "desc" },
      take: 200,
    });
    return NextResponse.json(
      rows.map((b) => ({
        id: b.id,
        batch_no: b.batchNo,
        batch_type: b.batchType,
        available_kg: Number(b.availableKg),
        total_kg: Number(b.totalKg),
        parent_batch_no: b.parentBatch?.batchNo ?? null,
        // The mixing date from the batch voucher; falls back to when the batch was created.
        from: b.vouchers[0]?.notes?.startsWith("From ") ? b.vouchers[0].notes.slice(5) : null,
        date: (b.vouchers[0]?.voucherDate ?? b.createdAt).toISOString().slice(0, 10),
      })),
    );
  } catch (e) {
    return jsonError(e);
  }
}
