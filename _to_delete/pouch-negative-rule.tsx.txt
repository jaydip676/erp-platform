"use client";

import { SettingRule } from "@/components/setting-rule";

/** Admin stock rule shown on Inward Material → Pouch Material. */
export function PouchNegativeRule({ admin }: { admin: boolean }) {
  return <SettingRule name="pouch_allow_negative" canEdit={admin} readOnlyNote="Only an admin can change this" />;
}
