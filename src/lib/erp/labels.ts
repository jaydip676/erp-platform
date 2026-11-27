import { prisma } from "@/lib/prisma";
import { productName } from "@/lib/erp/product-name";
import { STORE_GROUPS } from "@/lib/erp/codes";

export const VOUCHER_TYPE_NAME: Record<string, string> = {
  PURCHASE: "Raw material receipt",
  STORE_PURCHASE: "Store receipt",
  MASTER_BATCH: "Master batch",
  FINAL_BATCH: "Final batch",
  EXTRUSION: "Extrusion",
  CURING: "Press",
  INSPECTION: "Inspection",
  PACKING: "Packing",
  OPENING: "Opening stock",
  TRANSFER: "Stock transfer",
  DISPATCH: "Dispatch",
};

export const ITEM_TYPE_NAME: Record<string, string> = {
  PRODUCT: "Tube",
  RAW: "Raw material",
  STORE: "Store item",
  BATCH: "Compound batch",
};

/** Names for stock-ledger items (tubes, raw materials, store items, batches), looked up in one go. */
export async function itemNamer() {
  const [products, materials, batches, storeItems] = await Promise.all([
    prisma.product.findMany({ select: { id: true, size: true, valveType: true, brand: true } }),
    prisma.rawMaterial.findMany({ select: { id: true, name: true } }),
    prisma.batch.findMany({ select: { id: true, batchNo: true } }),
    prisma.inventoryItem.findMany({ where: { group: { in: STORE_GROUPS } }, select: { id: true, name: true } }),
  ]);
  const product = new Map(products.map((p) => [p.id, productName(p)]));
  const material = new Map(materials.map((m) => [m.id, m.name]));
  const store = new Map(storeItems.map((m) => [m.id, m.name]));
  const batch = new Map(batches.map((b) => [b.id, b.batchNo]));
  return (itemType: string, id: number) =>
    itemType === "PRODUCT"
      ? (product.get(id) ?? `Tube #${id}`)
      : itemType === "RAW"
        ? (material.get(id) ?? `Material #${id}`)
        : itemType === "STORE"
          ? (store.get(id) ?? `Store item #${id}`)
          : (batch.get(id) ?? `Batch #${id}`);
}
