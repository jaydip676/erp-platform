import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEPTS: [string, string][] = [
  ["RAW", "Raw Material Store"],
  ["MASTER", "Master Batch"],
  ["FINAL", "Final Batch"],
  ["EXTRUSION", "Extrusion WIP"],
  ["CURING", "Curing WIP"],
  ["CURED", "Cured Tube"],
  ["QC", "Quality Approved"],
  ["FG", "Finished Goods"],
  ["STORE", "Packing Store"],
];

async function main() {
  const adminUser = process.env.ADMIN_USERNAME ?? "admin";
  const adminPass = process.env.ADMIN_PASSWORD ?? "changeme";

  const existing = await prisma.user.findFirst({ where: { username: adminUser } });
  if (!existing) {
    await prisma.user.create({
      data: {
        username: adminUser,
        passwordHash: await bcrypt.hash(adminPass, 12),
        role: "admin",
      },
    });
  }

  for (const [code, name] of DEPTS) {
    const d = await prisma.department.findFirst({ where: { code } });
    if (!d) await prisma.department.create({ data: { code, name } });
  }

  const productsPath = resolve(__dirname, "../seed/products_from_daily_prod.json");
  const products = JSON.parse(readFileSync(productsPath, "utf8")) as {
    size: string;
    valve_type: string;
    unit_weight_kg?: number;
    segment?: string | null;
  }[];

  for (const item of products) {
    const found = await prisma.product.findFirst({
      where: { size: item.size, valveType: item.valve_type },
    });
    if (!found) {
      await prisma.product.create({
        data: {
          size: item.size,
          valveType: item.valve_type,
          unitWeightKg: item.unit_weight_kg ?? null,
          segment: item.segment ?? null,
        },
      });
    }
  }

  const catalogPath = resolve(__dirname, "../seed/catalog_from_pdf.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
    kind: string;
    category: string;
    srNo: number;
    size: string;
    valve: string;
    packing: string;
    bagPcs: number | null;
    bags: number | null;
    domesticQty: number;
    exportQty: number;
  }[];

  for (const item of catalog) {
    if (!item.size || !item.domesticQty) continue;
    const key = { kind: item.kind, category: item.category, srNo: item.srNo };
    const found = await prisma.catalogItem.findUnique({ where: { kind_category_srNo: key } });
    if (!found) {
      await prisma.catalogItem.create({
        data: {
          ...key,
          size: item.size,
          valve: item.valve || "",
          packing: item.packing,
          bagPcs: item.bagPcs,
          bags: item.bags,
          domesticQty: item.domesticQty,
          exportQty: item.exportQty,
        },
      });
    } else {
      await prisma.catalogItem.update({
        where: { id: found.id },
        data: {
          size: item.size,
          valve: item.valve || "",
          packing: item.packing,
          bagPcs: item.bagPcs,
          bags: item.bags,
        },
      });
    }
  }

  const typeNames = new Set<string>();
  for (const item of catalog) if (item.size && item.domesticQty && item.category) typeNames.add(item.category);
  for (const name of ["Bicycle Tubes", "Car Radial", "Motor Cycle", "OTR"]) {
    const exists = [...typeNames].some((t) => t.toLowerCase() === name.toLowerCase());
    if (!exists) typeNames.add(name);
  }
  for (const name of typeNames) {
    const found = await prisma.productType.findUnique({ where: { name } });
    if (!found) await prisma.productType.create({ data: { name } });
  }

  const sizeMap = new Map<string, Set<string>>();
  for (const item of catalog) {
    if (!item.size || !item.domesticQty) continue;
    const set = sizeMap.get(item.size) ?? new Set<string>();
    if (item.valve) set.add(item.valve);
    sizeMap.set(item.size, set);
  }
  for (const [size, valves] of sizeMap) {
    const row = await prisma.sizeMaster.upsert({
      where: { size },
      update: {},
      create: { size },
    });
    for (const valve of valves) {
      const found = await prisma.sizeValve.findFirst({ where: { sizeId: row.id, valve } });
      if (!found) await prisma.sizeValve.create({ data: { sizeId: row.id, valve } });
    }
  }

  let nextCode = 1;
  async function takeCode(preferred?: string) {
    if (preferred) {
      const used = await prisma.inventoryItem.findUnique({ where: { code: preferred } });
      if (!used) return preferred;
    }
    while (await prisma.inventoryItem.findUnique({ where: { code: String(nextCode) } })) nextCode += 1;
    const code = String(nextCode);
    nextCode += 1;
    return code;
  }

  async function ensureItem(group: string, name: string, unit: string, preferredCode?: string) {
    const found = await prisma.inventoryItem.findFirst({ where: { group, name } });
    if (found) return found;
    return prisma.inventoryItem.create({
      data: { code: await takeCode(preferredCode), name, unit, group },
    });
  }

  const groupRows = [
    { code: "1", name: "Raw Material" },
    { code: "2", name: "Finished Goods" },
    { code: "3", name: "Store Item" },
  ];
  const gradeRows = [
    { code: "1", name: "cvaz" },
    { code: "2", name: "viaz" },
    { code: "3", name: "jkc" },
  ];
  for (const row of groupRows) {
    const byCode = await prisma.itemGroup.findUnique({ where: { code: row.code } });
    if (byCode) await prisma.itemGroup.update({ where: { id: byCode.id }, data: { name: row.name, active: true } });
    else if (!(await prisma.itemGroup.findUnique({ where: { name: row.name } }))) await prisma.itemGroup.create({ data: row });
  }
  for (const row of gradeRows) {
    // Create-only: a grade the user deleted must not come back on the next start.
    const byCode = await prisma.qualityGrade.findUnique({ where: { code: row.code } });
    const byName = await prisma.qualityGrade.findUnique({ where: { name: row.name } });
    if (!byCode && !byName) await prisma.qualityGrade.create({ data: row });
  }
  const knownGroups = new Set((await prisma.itemGroup.findMany()).map((g) => g.name));
  const usedGroups = await prisma.inventoryItem.findMany({ distinct: ["group"], select: { group: true } });
  let nextGroupCode = (await prisma.itemGroup.findMany()).reduce((max, g) => Math.max(max, Number(g.code) || 0), 0);
  for (const row of usedGroups) {
    if (!row.group || knownGroups.has(row.group)) continue;
    nextGroupCode += 1;
    await prisma.itemGroup.create({ data: { code: String(nextGroupCode), name: row.group } });
  }

  const raws = await prisma.rawMaterial.findMany();
  for (const m of raws) await ensureItem("Raw Material", m.name, m.unit === "KG" ? "KGS" : m.unit || "KGS", m.code);

  const rawSheet = [
    { code: "01", name: "RECLAIM RUBBER", consQty: 84 },
    { code: "04", name: "CARBON BLACK", consQty: 18.3 },
    { code: "05", name: "RPO 201 OIL", consQty: 4 },
    { code: "06", name: "ZINC OXIDE", consQty: 2.6 },
    { code: "07", name: "STEARIC ACID", consQty: 0.53 },
    { code: "08", name: "PETROLEUM RESIN", consQty: 1.57 },
    { code: "09", name: "PARAFINE WAX", consQty: 0.26 },
  ];
  for (const row of rawSheet) {
    const data = {
      name: row.name,
      unit: "KGS",
      group: "Raw Material",
      marking: "F",
      itemSize: "",
      quality: "",
      consQty: row.consQty,
      mfgUse: "U",
    };
    const byCode = await prisma.inventoryItem.findUnique({ where: { code: row.code } });
    if (byCode) await prisma.inventoryItem.update({ where: { id: byCode.id }, data });
    else await ensureItem("Raw Material", row.name, "KGS", row.code).then((item) => prisma.inventoryItem.update({ where: { id: item.id }, data }));
    const raw = await prisma.rawMaterial.findUnique({ where: { code: row.code } });
    if (raw) await prisma.rawMaterial.update({ where: { id: raw.id }, data: { name: row.name, unit: "KG" } });
    else await prisma.rawMaterial.create({ data: { code: row.code, name: row.name, unit: "KG" } });
  }

  for (const [size, valves] of sizeMap) {
    await ensureItem("Finished Goods", size, "PCS");
    for (const valve of valves) await ensureItem("Store Item", valve, "PCS");
  }
  await ensureItem("Store Item", "Pouch", "PCS");
  await ensureItem("Store Item", "25 Plain Bag", "PCS");
  for (const name of ["Nut", "Washer", "Cap", "Valve Pin", "SMALL POUCH", "BIG POUCH", "nut/washer/cap", "valve pin", "big bags", "25 pcs pouch"]) {
    await ensureItem("Store Item", name, "PCS");
  }

  const rawInventory = await prisma.inventoryItem.findMany({ where: { group: "Raw Material" } });
  for (const item of rawInventory) {
    const found = await prisma.rawMaterial.findUnique({ where: { code: item.code } });
    if (!found) {
      await prisma.rawMaterial.create({ data: { code: item.code, name: item.name, unit: item.unit } });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });