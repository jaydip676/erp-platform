"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { Tabs } from "@/components/tabs";
import { Skeleton, SkeletonTable } from "@/components/skeleton";

type Row = {
  item_type: string;
  item_label: string;
  department: string;
  department_name: string;
  unit: string;
  balance: number;
};

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
// Show departments in the order material flows through the plant.
const ORDER = ["RAW", "STORE", "MASTER", "FINAL", "EXTRUSION", "CURED", "QC", "FG"];

function totals(rows: Row[]) {
  const byUnit = new Map<string, number>();
  for (const r of rows) byUnit.set(r.unit, (byUnit.get(r.unit) ?? 0) + r.balance);
  return [...byUnit].map(([u, n]) => `${fmt.format(n)} ${u}`).join(" · ");
}

export function StockClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dept, setDept] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api<Row[]>("/api/stock").then(setRows).catch(() => setRows([]));
  }, []);

  const depts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows ?? []) seen.set(r.department, r.department_name);
    return [...seen].sort((a, b) => (ORDER.indexOf(a[0]) + 99) % 99 - (ORDER.indexOf(b[0]) + 99) % 99);
  }, [rows]);

  const q = query.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => (dept === "all" || r.department === dept) && (!q || `${r.item_label} ${r.item_type}`.toLowerCase().includes(q)));

  if (rows === null) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading stock">
        <div className="flex gap-2 overflow-hidden">{["w-24", "w-32", "w-28", "w-32", "w-28"].map((w, i) => <Skeleton key={i} className={`h-9 shrink-0 rounded-full ${w}`} />)}</div>
        <div className="erp-panel"><Skeleton className="mb-4 h-10 w-full max-w-sm" /><SkeletonTable rows={8} cols={4} /></div>
      </div>
    );
  }
  if (rows.length === 0) return <div className="erp-panel text-sm text-[#737373]">No stock posted yet. Receive raw material or post opening stock first.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {depts.map(([code, name]) => {
          const list = rows.filter((r) => r.department === code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => setDept(dept === code ? "all" : code)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${dept === code ? "border-[#171717] bg-[#fafafa]" : "border-[#e5e5e5] bg-white hover:bg-[#fafafa]"}`}
            >
              <div className="text-xs text-[#737373]">{name}</div>
              <div className="mt-0.5 truncate text-base font-semibold tabular-nums text-[#0a0a0a]">{totals(list)}</div>
              <div className="text-xs text-[#a3a3a3]">{list.length} item{list.length === 1 ? "" : "s"}</div>
            </button>
          );
        })}
      </div>

      <div className="erp-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            tabs={[{ id: "all", label: "All", count: rows.length }, ...depts.map(([code, name]) => ({ id: code, label: name, count: rows.filter((r) => r.department === code).length }))]}
            value={dept}
            onChange={setDept}
          />
          <input className="erp-input mt-0 w-64" placeholder="Search item" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                {dept === "all" && <th>Department</th>}
                <th className="text-right">Balance</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-[#a3a3a3]">No items match.</td></tr>
              )}
              {shown.map((r) => (
                <tr key={`${r.department}-${r.item_type}-${r.item_label}-${r.unit}`}>
                  <td className="font-medium">{r.item_label}</td>
                  <td className="text-[#737373]">{r.item_type}</td>
                  {dept === "all" && <td className="text-[#737373]">{r.department_name}</td>}
                  <td className={`text-right tabular-nums font-semibold ${r.balance < 0 ? "text-rose-700" : ""}`}>{fmt.format(r.balance)}</td>
                  <td className="text-[#737373]">{r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length > 0 && <p className="mt-2 text-right text-xs text-[#737373]">{shown.length} rows · {totals(shown)}</p>}
      </div>
    </div>
  );
}
