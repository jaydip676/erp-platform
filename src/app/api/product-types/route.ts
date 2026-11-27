import { bustMasters, cachedMaster } from "@/lib/server-cache";
import { requirePerm } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";

/** Types every plant starts with. Matched case-insensitively, so existing CAR RADIAL / MOTOR CYCLE rows are reused. */
const DEFAULT_TYPES = ["Bicycle Tubes", "Car Radial", "Motor Cycle", "OTR"];

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** Product types that exist on the product list but not yet in the type table (first run, imports). */
async function syncFromCatalog() {
  const [known, used] = await Promise.all([
    prisma.productType.findMany({ select: { name: true } }),
    prisma.catalogItem.findMany({ where: { active: true }, select: { category: true }, orderBy: { id: "asc" } }),
  ]);
  const have = new Set(known.map((t) => t.name.toLowerCase()));
  const missing: string[] = [];
  for (const { category } of [...used, ...DEFAULT_TYPES.map((category) => ({ category }))]) {
    const name = category.trim();
    if (!name || have.has(name.toLowerCase())) continue;
    have.add(name.toLowerCase());
    missing.push(name);
  }
  if (missing.length) await prisma.productType.createMany({ data: missing.map((name) => ({ name })), skipDuplicates: true });
}

export async function GET(req: Request) {
  try {
    await requireUser(req);
    return NextResponse.json(
      await cachedMaster(`m:product-types${new URL(req.url).search}`, async () => {
      await syncFromCatalog();
      const rows = await prisma.productType.findMany({ where: { active: true }, orderBy: { id: "asc" } });
      return (rows.map((t) => ({ id: t.id, name: t.name })));
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requirePerm(req, "masters.products.edit");
    const { name } = nameSchema.parse(await req.json());
    const existing = await prisma.productType.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing?.active) throw new ApiError(`${existing.name} is already a product type.`, 409);
    const row = existing
      ? await prisma.productType.update({ where: { id: existing.id }, data: { active: true } })
      : await prisma.productType.create({ data: { name } });
    return NextResponse.json({ id: row.id, name: row.name });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}

/** Removes a type and hides its products. Both are soft-deleted (active = false). */
export async function DELETE(req: Request) {
  try {
    await requirePerm(req, "masters.products.edit");
    const id = z.number().int().parse(Number(new URL(req.url).searchParams.get("id")));
    const type = await prisma.productType.findUnique({ where: { id } });
    if (!type) throw new ApiError("Product type not found", 404);
    const [products] = await prisma.$transaction([
      prisma.catalogItem.updateMany({ where: { category: type.name, active: true }, data: { active: false } }),
      prisma.productType.update({ where: { id }, data: { active: false } }),
    ]);
    return NextResponse.json({ ok: true, products_removed: products.count });
  } catch (e) {
    return jsonError(e);
  } finally {
    bustMasters();
  }
}
