"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";
import { useConfirm } from "@/components/confirm";

type Setting = { value: boolean; updated_at: string | null; updated_by: string | null };
export type RuleKey = "packing_auto_deduction" | "pouch_allow_negative";

type Rule = {
  title: string;
  /** Short state on the button. */
  onLabel: string;
  offLabel: string;
  onText: string;
  offText: string;
  /** The value that needs attention: the bar turns red in that state. */
  warnWhen: boolean;
  confirmOn: { title: string; body: string; confirm: string };
  confirmOff: { title: string; body: string; confirm: string };
  /** Small tag after the title, such as ADMIN. */
  tag: string;
};

export const RULES: Record<RuleKey, Rule> = {
  packing_auto_deduction: {
    title: "Stock rule: auto deduction at Step 4",
    onLabel: "On",
    offLabel: "Off",
    onText: "On: pouches, nut/washer/cap, valve pins and bags are deducted when tubes are packed.",
    offText: "Off: Step 4 posts without deducting any packing items.",
    warnWhen: false,
    confirmOn: { title: "Turn auto deduction on?", body: "From the next Step 4 entry, packing items are deducted from the packing store again.", confirm: "Turn on" },
    confirmOff: {
      title: "Turn auto deduction off?",
      body: "Step 4 entries will post without deducting pouches, nut/washer/cap, valve pins or bags until you turn it back on. Entries already posted are not changed.",
      confirm: "Turn off",
    },
    tag: "Packing edit",
  },
  pouch_allow_negative: {
    title: "Stock rule: negative stock for Pouch Items",
    onLabel: "Allowed",
    offLabel: "Not allowed",
    onText: "Allowed: Step 4 can take pouches below zero. Receive stock to bring them back up.",
    offText: "Not allowed: Step 4 stops when a pouch is short in the store.",
    warnWhen: true,
    confirmOn: {
      title: "Allow negative stock for Pouch Items?",
      body: "Step 4 will post even when a pouch is short, and its stock can go below zero. Nut/Washer/Cap, Valve Pin and bags still need enough stock.",
      confirm: "Allow negative stock",
    },
    confirmOff: {
      title: "Stop negative stock for Pouch Items?",
      body: "Step 4 will stop again when a pouch is short. Pouches already below zero stay negative until stock is received.",
      confirm: "Stop negative stock",
    },
    tag: "Admin",
  },
};

/**
 * A plant-wide stock rule as a slim bar: lock icon, tag, and a checkbox-style button.
 * The bar turns red when the rule is in its risky state.
 */
export function SettingRule({ name, canEdit, readOnlyNote, className = "mb-4" }: { name: RuleKey; canEdit: boolean; readOnlyNote: string; className?: string }) {
  const confirm = useConfirm();
  const rule = RULES[name];
  const [s, setS] = useState<Setting | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Record<RuleKey, Setting>>("/api/settings").then((r) => setS(r[name])).catch(() => setS(null));
  }, [name]);
  const on = s?.value ?? name === "packing_auto_deduction";
  const warn = on === rule.warnWhen;

  async function flip() {
    if (!canEdit || busy) return;
    const next = !on;
    const ask = next ? rule.confirmOn : rule.confirmOff;
    if (!(await confirm({ ...ask, danger: next === rule.warnWhen }))) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api<Record<RuleKey, Setting>>("/api/settings", { method: "PATCH", body: JSON.stringify({ key: name, value: next }) });
      setS(r[name]);
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Could not change. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2.5 ${warn ? "border-rose-300 bg-rose-50/60" : "border-[#d4d4d4] bg-white"} ${className}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#171717] text-white" aria-hidden>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#171717]">
          {rule.title}
          <span className="rounded bg-[#171717] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{rule.tag}</span>
        </div>
        <div className={`text-xs ${warn ? "font-semibold text-rose-700" : "text-[#737373]"}`}>
          {err || (on ? rule.onText : rule.offText)}
          {!err && s?.updated_by && <span className="font-normal text-[#a3a3a3]"> · changed by {s.updated_by}</span>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={rule.title}
        disabled={!canEdit || busy || s === null}
        onClick={flip}
        title={canEdit ? undefined : readOnlyNote}
        className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 max-lg:h-11 ${
          warn
            ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
            : on
              ? "border-[#171717] bg-[#171717] text-white hover:bg-[#262626]"
              : "border-[#d4d4d4] bg-white text-[#404040] hover:bg-[#f5f5f5]"
        }`}
      >
        <span className={`grid h-4 w-4 place-items-center rounded-sm border ${on ? "border-white bg-white" : warn ? "border-white" : "border-[#a3a3a3]"} ${warn ? "text-rose-600" : "text-[#171717]"}`} aria-hidden>
          {on && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          )}
        </span>
        {on ? rule.onLabel : rule.offLabel}
      </button>
    </div>
  );
}
