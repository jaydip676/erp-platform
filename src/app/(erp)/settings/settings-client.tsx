"use client";

import { RULES, SettingRule, type RuleKey } from "@/components/setting-rule";

/**
 * Every setting from RULES, grouped by area. A new setting only needs adding to
 * SETTINGS (lib/erp/settings.ts) and RULES (components/setting-rule.tsx); it then shows here.
 */
export function SettingsClient() {
  const keys = Object.keys(RULES) as RuleKey[];
  const groups = [...new Set(keys.map((k) => RULES[k].group))];
  return (
    <div className="space-y-4">
      <p className="erp-hint !mb-0">Plant-wide switches. Only admins can see and change them. Each change is confirmed and shows who made it.</p>
      {groups.map((g) => (
        <div key={g} className="erp-panel">
          <h2 className="mb-3 text-base font-semibold">{g}</h2>
          <div className="space-y-2">
            {keys.filter((k) => RULES[k].group === g).map((k) => (
              <SettingRule key={k} name={k} canEdit readOnlyNote="" className="" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
