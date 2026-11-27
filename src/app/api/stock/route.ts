import { NextResponse } from "next/server";
import { productName as nameOfProduct } from "@/lib/erp/product-name";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import { stockSnapshot, syncDepartmentNames } from "@/lib/erp/stock";
import { STORE_GROUPS } from "@/lib/erp/codes";

export async function GET(req: Request) {
  try {
    await requireUser(req);
    await syncDepartmentNames(prisma);
    const [rows, products, materials, batches, departments, storeItems] = await Promise.all([
      stockSnapshot(prisma),
      prisma.product.findMany(),
      prisma.rawMaterial.findMany(),
      prisma.batch.findMany(),
      prisma.department.findMany(),
      prisma.inventoryItem.findMany({ where: { group: { in: STORE_GROUPS } } }),
    ]);
    const productName = new Map(products.map((p) => [p.id, nameOfProduct(p)]));
    const materialName = new Map(materials.map((m) => [m.id, m.name]));
    const storeName = new Map(storeItems.map((m) => [m.id, m.name]));
    const batchName = new Map(batches.map((b) => [b.id, b.batchNo]));
    const deptName = new Map(departments.map((d) => [d.code, d.name]));

    return NextResponse.json(
      rows
        .filter((r) => Math.abs(r.balance) > 0.0005)
        .map((r) => ({
          ...r,
          item_type: r.itemType === "PRODUCT" ? "Tube" : r.itemType === "RAW" ? "Raw material" : r.itemType === "STORE" ? "Store item" : "Compound batch",
          department_name: deptName.get(r.department) ?? r.department,
          item_label:
            r.itemType === "PRODUCT"
              ? (productName.get(r.itemId) ?? `Product #${r.itemId}`)
              : r.itemType === "RAW"
                ? (materialName.get(r.itemId) ?? `Material #${r.itemId}`)
                : r.itemType === "STORE"
                  ? (storeName.get(r.itemId) ?? `Store item #${r.itemId}`)
                  : (batchName.get(r.itemId) ?? `Batch #${r.itemId}`),
        }))
        .sort((a, b) => a.department.localeCompare(b.department) || a.item_label.localeCompare(b.item_label)),
    );
  } catch (e) {
    return jsonError(e);
  }
}
