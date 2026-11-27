"use client";

import { DateInput } from "@/components/date-input";
import { useCallback, useEffect, useState } from "react";
import { SkeletonRows } from "@/components/skeleton";
import { api, ApiClientError } from "@/lib/client-api";
import { showDate, todayISO } from "@/lib/dates";
import { Banner } from "@/components/banner";

type Day = {
  date: string;
  vouchers: number;
  raw_received_kg: number;
  master_kg: number;
  final_kg: number;
  green_tubes: number;
  extrusion_kg: number;
  rework_kg: number;
  pressed: number;
  inspected: number;
  repair: number;
  second: number;
  scrap: number;
  packed: number;
};
type Key = Exclude<keyof Day, "date">;

const COLS: { key: Key; label: string; kg?: boolean; tone?: string }[] = [
  { key: "raw_received_kg", label: "Raw received KG", kg: true },
  { key: "master_kg", label: "Master KG", kg: true },
  { key: "final_kg", label: "Final KG", kg: true },
  { key: "green_tubes", label: "Green tubes" },
  { key: "extrusion_kg", label: "Extrusion KG", kg: true },
  { key: "rework_kg", label: "Rework KG", kg: true },
  { key: "pressed", label: "Pressed" },
  { key: "inspected", label: "Inspected" },
  { key: "repair", label: "Repair", tone: "text-sky-700" },
  { key: "second", label: "Second", tone: "text-amber-700" },
  { key: "scrap", label: "Scrap", tone: "text-rose-700" },
  { key: "packed", label: "Packed (FG)" },
  { key: "vouchers", label: "Vouchers" },
];

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export function ReportsClient() {
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Day[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (f: string, t: string) => {
    try {
      setError("");
      setRows(await api<Day[]>(`/api/reports/daily?from_date=${f}&to_date=${t}`));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not load the report");
    }
  }, []);

  useEffect(() => {
    if (from && to && from <= to) load(from, to);
  }, [from, to, load]);

  const total = (k: Key) => (rows ?? []).reduce((n, r) => n + r[k], 0);

  function exportCsv() {
    if (!rows) return;
    const head = ["Date", ...COLS.map((c) => c.label)];
    const lines = [head, ...rows.map((r) => [showDate(r.date), ...COLS.map((c) => r[c.key])]), ["Total", ...COLS.map((c) => Number(total(c.key).toFixed(3)))]];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="erp-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-lg font-semibold">Daily production</h2>
          <p className="erp-hint !mb-0">What each department did per day. Deleted vouchers are not counted.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="erp-label">
            From
            <DateInput className="erp-input w-40" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="erp-label">
            To
            <DateInput className="erp-input w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className="erp-btn erp-btn-secondary mt-0 h-[38px]" onClick={exportCsv} disabled={!rows?.length}>
            Export to Excel
          </button>
        </div>
      </div>
      {error && <Banner ok={false}>{error}</Banner>}
      <div className="mt-2 overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Date</th>
              {COLS.map((c) => <th key={c.key} className="text-right">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows === null && <SkeletonRows rows={6} cols={COLS.length + 1} />}
            {rows?.length === 0 && <tr><td colSpan={COLS.length + 1} className="py-6 text-center text-[#a3a3a3]">Nothing posted between {showDate(from)} and {showDate(to)}.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.date}>
                <td className="whitespace-nowrap font-medium tabular-nums">{showDate(r.date)}</td>
                {COLS.map((c) => (
                  <td key={c.key} className={`text-right tabular-nums ${r[c.key] ? c.tone ?? "" : "text-[#d4d4d4]"}`}>{r[c.key] ? fmt.format(r[c.key]) : "–"}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {rows && rows.length > 0 && (
            <tfoot>
              <tr className="bg-[#fafafa] font-semibold">
                <td>Total</td>
                {COLS.map((c) => <td key={c.key} className="text-right tabular-nums">{fmt.format(total(c.key))}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
