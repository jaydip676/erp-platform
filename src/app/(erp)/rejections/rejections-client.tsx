"use client";

import { useEffect, useState } from "react";
import { SkeletonRows } from "@/components/skeleton";
import { api } from "@/lib/client-api";
import { showDate, todayISO } from "@/lib/dates";
import { Tabs } from "@/components/tabs";

type Row = {
  date: string;
  voucher_no: string;
  department_name: string;
  product: string;
  type: string;
  quantity: number;
  reason: string | null;
};

const TYPES = ["REPAIR", "SECOND", "SCRAP"] as const;
const TYPE_NAME: Record<string, string> = { REPAIR: "Repair", SECOND: "Second", SCRAP: "Scrap" };
const TYPE_TONE: Record<string, string> = { REPAIR: "bg-sky-50 text-sky-700", SECOND: "bg-amber-50 text-amber-800", SCRAP: "bg-rose-50 text-rose-700" };

export function RejectionsClient() {
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!from || !to || from > to) return;
    api<Row[]>(`/api/rejections?from=${from}&to=${to}`).then(setRows).catch(() => setRows([]));
  }, [from, to]);

  const q = query.trim().toLowerCase();
  const inRange = rows ?? [];
  const shown = inRange.filter((r) => (type === "all" || r.type === type) && (!q || `${r.product} ${r.voucher_no} ${r.department_name}`.toLowerCase().includes(q)));
  const sum = (t?: string) => inRange.filter((r) => !t || r.type === t).reduce((n, r) => n + r.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Total rejected", sum()], ...TYPES.map((t) => [TYPE_NAME[t], sum(t)] as const)].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-3">
            <div className="text-xs text-[#737373]">{label}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{Number(n).toLocaleString("en-IN")} <span className="text-sm font-medium text-[#a3a3a3]">PCS</span></div>
          </div>
        ))}
      </div>

      <div className="erp-panel">
        <h2 className="mb-1 text-lg font-semibold">Rejection register</h2>
        <p className="erp-hint">Repair, Second and Scrap from inspection, each linked to the production voucher that recorded it.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="erp-label">
            From
            <input className="erp-input w-40" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="erp-label">
            To
            <input className="erp-input w-40" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Tabs
            className="pb-0.5"
            tabs={[{ id: "all", label: "All" }, ...TYPES.map((t) => ({ id: t, label: TYPE_NAME[t] }))]}
            value={type}
            onChange={setType}
          />
          <input className="erp-input ml-auto mt-0 w-56" placeholder="Search size, voucher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher</th>
                <th>Department</th>
                <th>Size / valve</th>
                <th>Type</th>
                <th className="text-right">PCS</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && <SkeletonRows rows={6} cols={7} />}
              {rows !== null && shown.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-[#a3a3a3]">No rejections between {showDate(from)} and {showDate(to)}.</td></tr>
              )}
              {shown.map((r, i) => (
                <tr key={`${r.voucher_no}-${r.type}-${i}`}>
                  <td className="whitespace-nowrap tabular-nums">{showDate(r.date)}</td>
                  <td className="whitespace-nowrap font-medium">{r.voucher_no}</td>
                  <td className="text-[#737373]">{r.department_name}</td>
                  <td>{r.product}</td>
                  <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TYPE_TONE[r.type] ?? "bg-[#f5f5f5]"}`}>{TYPE_NAME[r.type] ?? r.type}</span></td>
                  <td className="text-right tabular-nums font-semibold">{r.quantity.toLocaleString("en-IN")}</td>
                  <td className="text-[#737373]">{r.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
