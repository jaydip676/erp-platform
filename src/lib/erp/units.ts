export const INVENTORY_UNITS = ["BAG", "BOX", "KGS", "LTR", "MTR", "NOS", "PCS", "TON"] as const;

export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const DEFAULT_INVENTORY_GROUPS = ["Raw Material", "Finished Goods", "Store Item"] as const;

export function isPackingPouch(name: string) {
  return /^(small\s+|big\s+)?pouch$/i.test(name.trim());
}

export function normalizeInventoryUnit(unit: string): InventoryUnit {
  const value = unit.trim().toUpperCase();
  if (value === "KG" || value === "KGS") return "KGS";
  if ((INVENTORY_UNITS as readonly string[]).includes(value)) return value as InventoryUnit;
  throw new Error("Unit must be BAG, BOX, KGS, LTR, MTR, NOS, PCS, or TON.");
}
