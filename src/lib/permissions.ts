/**
 * Every permission in the app. Admins have all of them; other users only the ones an admin ticks.
 * A page's "view" key is needed to open the page; the other keys unlock its tabs and actions.
 * Safe to import in the browser.
 */
export type PermItem = { key: string; label: string; hint?: string };
export type PermPage = { page: string; label: string; href: string; view: string; items: PermItem[] };

export const PERMISSION_PAGES: PermPage[] = [
  { page: "dashboard", label: "Dashboard", href: "/dashboard", view: "dashboard.view", items: [] },
  {
    page: "materials",
    label: "Inward Material",
    href: "/materials",
    view: "materials.view",
    items: [
      { key: "materials.raw", label: "Raw Material tab", hint: "See and post raw material receipts" },
      { key: "materials.store", label: "Store Material tab", hint: "See and post store item receipts" },
      { key: "materials.pouch", label: "Pouch Material tab", hint: "See and post pouch receipts" },
    ],
  },
  {
    page: "mixing",
    label: "Mixing Department",
    href: "/mixing",
    view: "mixing.view",
    items: [
      { key: "mixing.master", label: "Master Batch tab", hint: "See and create master batches" },
      { key: "mixing.final", label: "Final Batch tab", hint: "See and create final batches" },
    ],
  },
  {
    page: "process",
    label: "Production",
    href: "/process",
    view: "process.view",
    items: [
      { key: "process.extrusion", label: "Step 1 · Extrusion" },
      { key: "process.curing", label: "Step 2 · Press" },
      { key: "process.inspection", label: "Step 3 · Inspection" },
      { key: "process.packing", label: "Step 4 · Packing" },
    ],
  },
  {
    page: "stock",
    label: "Department Stock",
    href: "/stock",
    view: "stock.view",
    items: [
      { key: "stock.departments", label: "Department Stock tab" },
      { key: "stock.transfer", label: "Green Tube Transfer tab", hint: "See and post transfers" },
    ],
  },
  {
    page: "dispatch",
    label: "Dispatch",
    href: "/dispatch",
    view: "dispatch.view",
    items: [
      { key: "dispatch.post", label: "Post a dispatch", hint: "Send finished goods and batches to a client" },
      { key: "dispatch.clients", label: "Add and edit clients" },
    ],
  },
  { page: "rejections", label: "Rejections", href: "/rejections", view: "rejections.view", items: [] },
  { page: "reports", label: "Daily Report", href: "/reports", view: "reports.view", items: [] },
  { page: "vouchers", label: "Vouchers", href: "/vouchers", view: "vouchers.view", items: [] },
  {
    page: "masters",
    label: "Masters",
    href: "/masters",
    view: "masters.view",
    items: [
      { key: "masters.items.view", label: "Item Master · view" },
      { key: "masters.items.edit", label: "Item Master · add, edit, delete" },
      { key: "masters.products.view", label: "Product List · view" },
      { key: "masters.products.edit", label: "Product List · add, edit, delete" },
      { key: "masters.batches.view", label: "Batch Master · view" },
      { key: "masters.batches.edit", label: "Batch Master · add, edit, delete" },
      { key: "masters.packing.view", label: "Auto Consumption Packing · view" },
      { key: "masters.packing.edit", label: "Auto Consumption Packing · edit" },
      { key: "masters.groups.view", label: "Group Entry · view" },
      { key: "masters.groups.edit", label: "Group Entry · add, edit, delete" },
      { key: "masters.qualities.view", label: "Quality (Grade) · view" },
      { key: "masters.qualities.edit", label: "Quality (Grade) · add, edit, delete" },
      { key: "masters.opening.view", label: "Opening Stock · view" },
      { key: "masters.opening.edit", label: "Opening Stock · post" },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_PAGES.flatMap((p) => [p.view, ...p.items.map((i) => i.key)]);
const KNOWN = new Set(ALL_PERMISSIONS);

/**
 * Cleans a stored list: drops unknown keys and adds what a key depends on
 * (any key on a page opens the page; "edit" on a Masters tab includes "view").
 */
export function normalizePermissions(input: unknown): string[] {
  const set = new Set<string>();
  for (const k of Array.isArray(input) ? input : []) if (typeof k === "string" && KNOWN.has(k)) set.add(k);
  for (const page of PERMISSION_PAGES) {
    if (page.items.some((i) => set.has(i.key))) set.add(page.view);
  }
  for (const k of [...set]) if (k.startsWith("masters.") && k.endsWith(".edit")) set.add(k.replace(/\.edit$/, ".view"));
  return ALL_PERMISSIONS.filter((k) => set.has(k));
}

/** The first page a user may open, or null when they may open nothing. */
export function homePath(perms: string[]) {
  return PERMISSION_PAGES.find((p) => perms.includes(p.view))?.href ?? null;
}

/** A deleted user's ID is stored as "name~deleted~7" to free the name; show just "name". */
export function shownUsername(username: string | null | undefined) {
  return (username ?? "").replace(/~deleted~\d+$/, "");
}
