/**
 * Every permission in the app. Admins have all of them; other users only the ones an admin ticks.
 * A page's "view" key is needed to open the page; the other keys unlock its tabs and actions.
 * Safe to import in the browser.
 */
export type Action = "view" | "add" | "edit" | "delete";
/** One section of a page. Its keys are `${base}.view`, `${base}.add` (new entries), `${base}.edit` (change existing ones) and `${base}.delete`. */
export type PermItem = { base: string; label: string; actions: Action[]; hint?: string };
export type PermPage = { page: string; label: string; href: string; view: string; items: PermItem[] };

const VED: Action[] = ["view", "add", "edit", "delete"];
const V: Action[] = ["view"];

export const ACTION_LABEL: Record<Action, string> = { view: "View", add: "Add", edit: "Edit", delete: "Delete" };

export const PERMISSION_PAGES: PermPage[] = [
  { page: "dashboard", label: "Dashboard", href: "/dashboard", view: "dashboard.view", items: [] },
  {
    page: "materials",
    label: "Inward Material",
    href: "/materials",
    view: "materials.view",
    items: [
      { base: "materials.raw", label: "Raw Material", actions: VED },
      { base: "materials.store", label: "Store Material", actions: VED },
      { base: "materials.pouch", label: "Pouch Material", actions: VED },
    ],
  },
  {
    page: "mixing",
    label: "Mixing Department",
    href: "/mixing",
    view: "mixing.view",
    items: [
      { base: "mixing.master", label: "Master Batch", actions: VED },
      { base: "mixing.final", label: "Final Batch", actions: VED },
    ],
  },
  {
    page: "process",
    label: "Production",
    href: "/process",
    view: "process.view",
    items: [
      { base: "process.extrusion", label: "Step 1 · Extrusion", actions: VED },
      { base: "process.curing", label: "Step 2 · Press", actions: VED },
      { base: "process.inspection", label: "Step 3 · Inspection", actions: VED },
      { base: "process.packing", label: "Step 4 · Packing", actions: VED },
    ],
  },
  {
    page: "stock",
    label: "Department Stock",
    href: "/stock",
    view: "stock.view",
    items: [
      { base: "stock.departments", label: "Department Stock", actions: V },
    ],
  },
  {
    page: "dispatch",
    label: "Dispatch",
    href: "/dispatch",
    view: "dispatch.view",
    items: [
      { base: "dispatch.fg", label: "Finished Goods", actions: VED },
      { base: "dispatch.master", label: "Master Batches", actions: VED },
      { base: "dispatch.final", label: "Final Batches", actions: VED },
      { base: "dispatch.raw", label: "Raw Material", actions: VED },
      { base: "dispatch.store", label: "Store Material", actions: VED },
      { base: "dispatch.pouch", label: "Pouch Material", actions: VED },
      { base: "dispatch.clients", label: "Clients", actions: VED },
      // Stock Transfer is a tab on the Dispatch page. Its keys keep the old "stock.transfer" name.
      { base: "stock.transfer", label: "Stock Transfer", actions: VED },
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
      { base: "masters.items", label: "Item Master", actions: VED },
      { base: "masters.products", label: "Product List", actions: VED },
      { base: "masters.batches", label: "Batch Master", actions: VED },
      { base: "masters.packing", label: "Auto Consumption Packing", actions: VED },
      { base: "masters.groups", label: "Group Entry", actions: VED },
      { base: "masters.qualities", label: "Quality (Grade)", actions: VED },
      { base: "masters.opening", label: "Opening Stock", actions: VED },
    ],
  },
];

export const itemKeys = (i: PermItem) => i.actions.map((a) => `${i.base}.${a}`);
export const ALL_PERMISSIONS: string[] = PERMISSION_PAGES.flatMap((p) => [p.view, ...p.items.flatMap(itemKeys)]);
const KNOWN = new Set(ALL_PERMISSIONS);

const DISPATCH_KINDS = ["fg", "master", "final", "raw", "store", "pouch"];
/** Keys from before View / Add / Edit / Delete, mapped to the new ones ("see and post" became view + add). */
function legacy(k: string): string[] {
  if (/^(materials\.(raw|store|pouch)|mixing\.(master|final)|process\.(extrusion|curing|inspection|packing)|stock\.transfer)$/.test(k)) return [`${k}.view`, `${k}.add`];
  if (k === "stock.departments") return ["stock.departments.view"];
  if (k === "dispatch.post") return DISPATCH_KINDS.flatMap((d) => [`dispatch.${d}.view`, `dispatch.${d}.add`]);
  if (k === "dispatch.clients") return ["dispatch.clients.view", "dispatch.clients.add", "dispatch.clients.edit"];
  return [k];
}

/**
 * Cleans a stored list: maps old keys, drops unknown ones, and adds what a key depends on
 * (add, edit or delete includes view; anything on a page opens the page).
 */
export function normalizePermissions(input: unknown): string[] {
  const set = new Set<string>();
  for (const raw of Array.isArray(input) ? input : []) {
    if (typeof raw !== "string") continue;
    for (const k of legacy(raw)) if (KNOWN.has(k)) set.add(k);
  }
  for (const k of [...set]) if (/\.(add|edit|delete)$/.test(k)) set.add(k.replace(/\.(add|edit|delete)$/, ".view"));
  // A page with sections opens only when something inside it is ticked.
  for (const page of PERMISSION_PAGES) {
    if (page.items.length === 0) continue;
    if (page.items.some((i) => itemKeys(i).some((k) => set.has(k)))) set.add(page.view);
    else set.delete(page.view);
  }
  return ALL_PERMISSIONS.filter((k) => set.has(k));
}

/** The section a voucher type belongs to, for its edit and delete rights. Dispatch and store receipts depend on their lines. */
export const VOUCHER_SECTION: Record<string, string | string[]> = {
  PURCHASE: "materials.raw",
  STORE_PURCHASE: ["materials.store", "materials.pouch"],
  MASTER_BATCH: "mixing.master",
  FINAL_BATCH: "mixing.final",
  EXTRUSION: "process.extrusion",
  CURING: "process.curing",
  INSPECTION: "process.inspection",
  PACKING: "process.packing",
  TRANSFER: "stock.transfer",
  OPENING: "masters.opening",
  DISPATCH: DISPATCH_KINDS.map((d) => `dispatch.${d}`),
};

/** For showing buttons: true when the user may do this to at least one section the voucher type can belong to. */
export function mayOnVoucherType(perms: string[], type: string, action: Action) {
  const s = VOUCHER_SECTION[type];
  if (!s) return false;
  return (Array.isArray(s) ? s : [s]).some((b) => perms.includes(`${b}.${action}`));
}

/** The first page a user may open, or null when they may open nothing. */
export function homePath(perms: string[]) {
  return PERMISSION_PAGES.find((p) => perms.includes(p.view))?.href ?? null;
}

/** A deleted user's ID is stored as "name~deleted~7" to free the name; show just "name". */
export function shownUsername(username: string | null | undefined) {
  return (username ?? "").replace(/~deleted~\d+$/, "");
}
