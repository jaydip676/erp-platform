import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return NextResponse.json(
      await cachedMaster(`m:catalog${new URL(req.url).search}`, async () => {
      const rows = await prisma.catalogItem.findMany({
        where: { active: true },
        orderBy: [{ kind: "asc" }, { category: "asc" }, { srNo: "asc" }],
      });
      return (
        rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          category: r.category,
          sr_no: r.srNo,
          size: r.size,
          valve: r.valve,
          bag_item: r.bagItem,
          packing: r.packing,
          bag_pcs: r.bagPcs,
          bags: r.bags,
          domestic_qty: r.domesticQty,
          export_qty: r.exportQty,
          weight_kg: r.weightKg,
          ex_kg: r.exKg,
        }))
      );
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

const patchSchema = z.object({
  id: z.number().int(),
  category: z.string().min(1),
  size: z.string().min(1),
  valve: z.string().optional().default(""),
  bag_item: z.string().optional().default(""),
  bag_pcs: z.number().int().min(0).nullable().optional(),
  bags: z.number().int().min(0).nullable().optional(),
  domestic_qty: z.number().int().min(0),
  export_qty: z.number().int().min(0),
  weight_kg: z.number().min(0),
  ex_kg: z.number().min(0),
});

function packingLabel(bagPcs: number | null | undefined, bags: number | null | undefined, domesticQty: number) {
  if (bagPcs && bags) return `${bagPcs}PCS X ${bags}`;
  return `${domesticQty} pcs`;
}

async function assertProductType(category: string) {
  const type = await prisma.productType.findFirst({ where: { name: category, active: true } });
  if (!type) throw new Error("Choose a product type from the Type tabs. Add the type first if it is new.");
}

async function assertFromInventory(size: string, valve: string, bag: string) {
  const fg = await prisma.inventoryItem.findFirst({
    where: { group: "Finished Goods", name: size, active: true },
  });
  if (!fg) throw new Error("Size must be a Finished Goods row in Item Master.");
  if (valve) {
    const store = await prisma.inventoryItem.findFirst({
      where: { group: "Store Item", name: valve, active: true },
    });
    if (!store) throw new Error("Valve must be a Store Item in Item Master.");
  }
  if (bag) {
    const store = await prisma.inventoryItem.findFirst({
      where: { group: "Store Item", name: bag, active: true },
    });
    if (!store) throw new Error("Bag must be a Store Item in Item Master.");
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePerm(req, "masters.products.edit");
    const body = patchSchema.parse(await req.json());
    await assertProductType(body.category);
    await assertFromInventory(body.size, body.valve, body.bag_item);
    const current = await prisma.catalogItem.findUnique({ where: { id: body.id } });
    if (!current) throw new Error("Product not found.");
    let srNo = current.srNo;
    if (body.category !== current.category) {
      const last = await prisma.catalogItem.findFirst({
        where: { kind: current.kind, category: body.category },
        orderBy: { srNo: "desc" },
      });
      srNo = (last?.srNo ?? 0) + 1;
    }
    const row = await prisma.catalogItem.update({
      where: { id: body.id },
      data: {
        category: body.category,
        srNo,
        size: body.size,
        valve: body.valve,
        bagItem: body.bag_item,
        bagPcs: body.bag_pcs ?? null,
        bags: body.bags ?? null,
        packing: packingLabel(body.bag_pcs, body.bags, body.domestic_qty),
        domesticQty: body.domestic_qty,
        exportQty: body.export_qty,
        weightKg: body.weight_kg,
        exKg: body.ex_kg,
      },
    });
    return NextResponse.json({
      id: row.id,
      category: row.category,
      sr_no: row.srNo,
      size: row.size,
      valve: row.valve,
      bag_item: row.bagItem,
      packing: row.packing,
      bag_pcs: row.bagPcs,
      bags: row.bags,
      domestic_qty: row.domesticQty,
      export_qty: row.exportQty,
      weight_kg: row.weightKg,
      ex_kg: row.exKg,
    });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

const createSchema = z.object({
  kind: z.enum(["FINISHED_TUBE", "BICYCLE_TUBE", "BICYCLE_TYRE", "LUBRICANT"]).optional(),
  category: z.string().min(1),
  size: z.string().min(1),
  valve: z.string().optional().default(""),
  bag_item: z.string().optional().default(""),
  bag_pcs: z.number().int().min(0).nullable().optional(),
  bags: z.number().int().min(0).nullable().optional(),
  domestic_qty: z.number().int().min(0),
  export_qty: z.number().int().min(0),
  weight_kg: z.number().min(0).default(0),
  ex_kg: z.number().min(0).default(0),
});

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.products.add");
    const body = createSchema.parse(await req.json());
    await assertProductType(body.category);
    await assertFromInventory(body.size, body.valve, body.bag_item);
    // Kind is internal. A new product takes the kind of its type's existing products.
    const sibling = await prisma.catalogItem.findFirst({ where: { category: body.category }, orderBy: { id: "asc" } });
    const kind = body.kind ?? sibling?.kind ?? "FINISHED_TUBE";
    const last = await prisma.catalogItem.findFirst({
      where: { kind, category: body.category },
      orderBy: { srNo: "desc" },
    });
    const row = await prisma.catalogItem.create({
      data: {
        kind,
        category: body.category,
        srNo: (last?.srNo ?? 0) + 1,
        size: body.size,
        valve: body.valve,
        bagItem: body.bag_item,
        packing: packingLabel(body.bag_pcs, body.bags, body.domestic_qty),
        bagPcs: body.bag_pcs ?? null,
        bags: body.bags ?? null,
        domesticQty: body.domestic_qty,
        exportQty: body.export_qty,
        weightKg: body.weight_kg,
        exKg: body.ex_kg,
      },
    });
    return NextResponse.json({ id: row.id });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

/** Hides one product from the list (active = false). The row stays in the database. */
export async function DELETE(req: Request) {
  try {
    await requirePerm(req, "masters.products.delete");
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    const current = await prisma.catalogItem.findFirst({ where: { id, active: true } });
    if (!current) throw new Error("Product not found.");
    await prisma.catalogItem.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}
