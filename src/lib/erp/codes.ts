/** Next auto code for a master list: the highest numeric code plus one. Non-numeric codes are ignored. */
export function nextNumericCode(codes: string[]) {
  const used = new Set(codes);
  let max = 0;
  for (const code of codes) if (/^\d+$/.test(code)) max = Math.max(max, Number(code));
  let next = max + 1;
  while (used.has(String(next))) next += 1;
  return String(next);
}

/** Item Master groups whose stock sits in the packing store (ledger type STORE). */
export const STORE_GROUPS = ["Store Item", "Pouch Item"];

/** Packing rules saved with this size apply to every size. A rule for one size overrides it for the same item and brand. */
export const ALL_SIZES = "*";

/**
 * Packing consumption added automatically for every size.
 * An Item Master item matches by its key, so "Nut/Washer/Cap", "NUT/WASHER/CAP SET", "Outer Bags-100"
 * and "OUTER BAGS 100" all count. If no item matches, one is created under this name.
 */
export const FIXED_PACKING_ITEMS: { key: string; name: string; qty: number }[] = [
  { key: "nut washer cap", name: "NUT/WASHER/CAP", qty: 1 },
  { key: "valve pin", name: "VALVE PIN", qty: 1 },
  { key: "outer bags 100", name: "OUTER BAGS-100", qty: 0.01 },
  { key: "outer bags 50", name: "OUTER BAGS-50", qty: 0.02 },
];

/** Lower case, punctuation as spaces, trailing "set" dropped. */
export function fixedItemKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+set$/, "");
}

/** Outer Bags-100 and Outer Bags-50 are auto-listed but not for every size: you pick their sizes and give each its own qty. */
export function isPerSizeItem(name: string) {
  const key = fixedItemKey(name);
  return key === "outer bags 100" || key === "outer bags 50";
}

export function findFixedItem(name: string) {
  const key = fixedItemKey(name);
  return FIXED_PACKING_ITEMS.find((f) => f.key === key);
}

/**
 * The group a master batch belongs to: its number without the date and count.
 * MB-V2-261121-0003 -> MB-V2. Older numbers without a formula (MB-261121-0001) fall in MB.
 */
export function masterGroup(batchNo: string) {
  const parts = batchNo.split("-");
  if (parts.length < 2) return batchNo;
  if (/^\d{6}$/.test(parts[1])) return parts[0];
  return `${parts[0]}-${parts[1]}`;
}

/**
 * The group a final batch belongs to: its number without the date and counter.
 * FB-FINALV1-MB-MASTERV1-261123-0003 -> FB-FINALV1-MB-MASTERV1. Older FB-261123-0005 fall in FB.
 */
export function finalGroup(batchNo: string) {
  return batchNo.replace(/-\d{6}-\d{4}$/, "");
}

/** Takes KG from batches in the order given, using up each before the next. */
export function drawInOrder<T extends { available_kg: number }>(batches: T[], kg: number) {
  const out: { batch: T; kg: number }[] = [];
  let left = kg;
  for (const batch of batches) {
    if (left <= 0.0000001) break;
    const take = Math.min(left, batch.available_kg);
    if (take > 0) out.push({ batch, kg: take });
    left -= take;
  }
  return { out, short: Math.max(left, 0) };
}

/** An item needs a brand when it is a Pouch Material (Pouch Item group) or a pouch by name. */
export function needsBrand(item: { name: string; group: string }, isPouchName: (name: string) => boolean) {
  // Nut/washer/cap, valve pin and the outer bags are used for every brand.
  if (findFixedItem(item.name)) return false;
  return item.group === "Pouch Item" || isPouchName(item.name);
}

/** Groups the plant logic depends on by name. They cannot be deleted. */
export const CORE_GROUPS = ["Raw Material", "Finished Goods", "Store Item"];

/** The formula part of a batch number: "MASTER V2" -> MASTERV2. A manual mix is MN. */
export function formulaTag(recipe: { name: string | null; code: string }) {
  return (recipe.name || recipe.code).toUpperCase().replace(/[^A-Z0-9]+/g, "") || "MN";
}

/**
 * Branded bags that share one qty per size, such as CZ 25 BAGS, VZ 25 BAGS and PLAIN 25 BAGS.
 * Returns the shared column name ("25 Bags"), or null for any other item. Outer Bags-100/-50 are not part of this.
 */
export function bagFamily(name: string): string | null {
  if (isPerSizeItem(name)) return null;
  const m = /(?:^|\s)(\d+)\s*BAGS?\s*$/i.exec(name.trim());
  if (!m || !name.trim().slice(0, m.index).trim()) return null;
  return `${m[1]} Bags`;
}
