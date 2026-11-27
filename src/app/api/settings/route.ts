import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, jsonError } from "@/lib/api-route";
import { requireAdmin } from "@/lib/access";
import { SETTINGS, getSetting, setSetting, type SettingKey } from "@/lib/erp/settings";

async function all() {
  const out: Record<string, { value: boolean; updated_at: string | null; updated_by: string | null }> = {};
  const keys = Object.keys(SETTINGS) as SettingKey[];
  const got = await Promise.all(keys.map((k) => getSetting(k)));
  keys.forEach((key, i) => {
    out[key] = { value: got[i].value, updated_at: got[i].updatedAt, updated_by: got[i].updatedBy };
  });
  return out;
}

/** GET: every plant switch. Anyone signed in may read them (Step 4 shows them). */
export async function GET(req: Request) {
  try {
    await requireUser(req);
    const s = await all();
    // packing_auto_deduction at the top level too, for older screens.
    return NextResponse.json({ ...s, packing_auto_deduction: s.packing_auto_deduction.value, updated_by: s.packing_auto_deduction.updated_by });
  } catch (e) {
    return jsonError(e);
  }
}

/** PATCH { key, value }. Admins only: every setting lives on the admin Settings page. */
export async function PATCH(req: Request) {
  try {
    const raw = await req.json();
    // Older screens send { packing_auto_deduction: true|false }.
    const body =
      typeof raw?.packing_auto_deduction === "boolean"
        ? { key: "packing_auto_deduction" as const, value: raw.packing_auto_deduction as boolean }
        : z.object({ key: z.enum(Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]]), value: z.boolean() }).parse(raw);
    const user = await requireAdmin(req);
    try {
      await setSetting(body.key, body.value, user.username);
    } catch {
      throw new ApiError("The settings table does not exist yet. Run npm run db:push, restart the app, and try again.");
    }
    return NextResponse.json(await all());
  } catch (e) {
    return jsonError(e);
  }
}
