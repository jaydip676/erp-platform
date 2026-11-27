import { prisma } from "@/lib/prisma";

/** Every switch with its default. Stored as text in app_settings. */
export const SETTINGS: { packing_auto_deduction: boolean; pouch_allow_negative: boolean; extrusion_kg_limit: boolean } = {
  /** Step 4 (Packing) deducts pouches, nut/washer/cap, valve pins and bags from the packing store. */
  packing_auto_deduction: true,
  /** Step 4 may take Pouch Items below zero stock. Other packing items always need enough stock. */
  pouch_allow_negative: false,
  /** Step 1 (Extrusion): Actual KG consumed may not exceed PCS × KG per piece + ExKg%. Off = any KG. */
  extrusion_kg_limit: true,
};
export type SettingKey = keyof typeof SETTINGS;

type Row = { key: string; value: string; updatedAt: Date; updatedBy: string | null };
type Store = {
  findUnique(args: { where: { key: string } }): Promise<Row | null>;
  upsert(args: { where: { key: string }; create: Partial<Row>; update: Partial<Row> }): Promise<Row>;
};
// Typed by hand so this works before the Prisma client is regenerated.
const store = () => (prisma as unknown as { appSetting: Store }).appSetting;

type Got = { value: boolean; updatedAt: string | null; updatedBy: string | null };
const cached = new Map<string, { got: Got; exp: number }>();

export async function getSetting<K extends SettingKey>(key: K): Promise<{ value: (typeof SETTINGS)[K]; updatedAt: string | null; updatedBy: string | null }> {
  const hit = cached.get(key);
  if (hit && hit.exp > Date.now()) return hit.got as { value: (typeof SETTINGS)[K]; updatedAt: string | null; updatedBy: string | null };
  const got = await readSetting(key);
  cached.set(key, { got: got as Got, exp: Date.now() + 15_000 });
  return got;
}

async function readSetting<K extends SettingKey>(key: K): Promise<{ value: (typeof SETTINGS)[K]; updatedAt: string | null; updatedBy: string | null }> {
  try {
    const row = await store().findUnique({ where: { key } });
    if (!row) return { value: SETTINGS[key], updatedAt: null, updatedBy: null };
    return { value: JSON.parse(row.value), updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy };
  } catch {
    // Table not created yet (db:push not run): use the default.
    return { value: SETTINGS[key], updatedAt: null, updatedBy: null };
  }
}

export async function setSetting<K extends SettingKey>(key: K, value: (typeof SETTINGS)[K], by: string) {
  const text = JSON.stringify(value);
  await store().upsert({ where: { key }, create: { key, value: text, updatedBy: by }, update: { value: text, updatedBy: by } });
  cached.delete(key);
}
