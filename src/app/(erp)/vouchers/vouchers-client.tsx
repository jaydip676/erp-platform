"use client";

import { Select } from "@/components/select";
import { ExpandIcon } from "@/components/expand-icon";
import { DateInput } from "@/components/date-input";
import { Spinner } from "@/components/spinner";
import { Fragment, useCallback, useEffect, useState } from "react";
import { SkeletonRows } from "@/components/skeleton";
import { Banner } from "@/components/banner";
import { VoucherAdminActions, type ActionResult } from "@/components/voucher-admin";
import { api } from "@/lib/client-api";
import { mayOnVoucherType } from "@/lib/permissions";
import { showDate, todayISO } from "@/lib/dates";

type Voucher = {
  voucher_no: string;
  type_code: string;
  type: string;
  date: string;
  quantity: string;
  items: string;
  notes: string | null;
  status: string;
  qty: number | null;
  output: number;
  repair: number;
  second: number;
  scrap: number;
  consumed_kg: number;
  rework_kg: number;
  final_weight_kg: number | null;
};
type Detail = {
  voucher_no: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  lines: { item: string; item_type: string; department: string; qty_in: number; qty_out: number; unit: string }[];
};

const TYPES: [string, string][] = [
  ["", "All types"],
  ["PURCHASE", "Raw material receipt"],
  ["STORE_PURCHASE", "Store receipt"],
  ["MASTER_BATCH", "Master batch"],
  ["FINAL_BATCH", "Final batch"],
  ["EXTRUSION", "Extrusion"],
  ["CURING", "Press"],
  ["INSPECTION", "Inspection"],
  ["PACKING", "Packing"],
  ["OPENING", "Opening stock"],
  ["DISPATCH", "Dispatch"],
  ["TRANSFER", "Stock transfer"],
];

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function VouchersClient({ perms = [] }: { perms?: string[] }) {
  // Edit / Delete show on a voucher when the user has that right on its section (the server checks the exact section).
  const rightOn = (type: string, a: "edit" | "delete") => mayOnVoucherType(perms, type, a);
  const admin = TYPES.some(([t]) => t && (rightOn(t, "edit") || rightOn(t, "delete")));
  const today = todayISO();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Voucher[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Detail>>({});
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const cols = admin ? 8 : 7;

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ limit: "500" });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (type) qs.set("type", type);
    if (query.trim()) qs.set("q", query.trim());
    setRows(await api<Voucher[]>(`/api/vouchers?${qs}`).catch(() => []));
  }, [from, to, type, query]);

  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggle(no: string) {
    if (open === no) return setOpen(null);
    setOpen(no);
    if (!detail[no]) {
      const d = await api<Detail>(`/api/vouchers?no=${encodeURIComponent(no)}`).catch(() => null);
      if (d) setDetail((cur) => ({ ...cur, [no]: d }));
    }
  }

  return (
    <div className="erp-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-lg font-semibold">Vouchers</h2>
          <p className="erp-hint !mb-0">Click a voucher to see the stock it moved.{admin ? " Edit and Delete show where you have those rights." : ""}</p>
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
          <label className="erp-label">
            Type
            <Select className="erp-input w-48" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </label>
          <label className="erp-label">
            Voucher no.
            <input className="erp-input w-48" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
      </div>
      {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <div className="mt-2 overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-8" />
              <th>Voucher</th>
              <th>Type</th>
              <th>Date</th>
              <th>Item</th>
              <th className="text-right">Quantity</th>
              <th>Status</th>
              {admin && <th className="w-28" />}
            </tr>
          </thead>
          <tbody>
            {rows === null && <SkeletonRows rows={8} cols={cols} />}
            {rows?.length === 0 && <tr><td colSpan={cols} className="py-6 text-center text-[#a3a3a3]">No vouchers match.</td></tr>}
            {rows?.map((v) => {
              const d = detail[v.voucher_no];
              const isOpen = open === v.voucher_no;
              return (
                <Fragment key={v.voucher_no}>
                  <tr onClick={() => toggle(v.voucher_no)} className={`cursor-pointer ${v.status === "VOID" ? "text-[#a3a3a3]" : ""} ${isOpen ? "bg-[#fafafa]" : ""}`}>
                    <td><ExpandIcon open={isOpen} size="sm" /></td>
                    <td className="whitespace-nowrap font-medium">{v.voucher_no}</td>
                    <td>{v.type}</td>
                    <td className="whitespace-nowrap tabular-nums">{showDate(v.date)}</td>
                    <td className="max-w-[320px] truncate" title={v.items}>{v.items || "–"}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{v.quantity || "–"}</td>
                    <td>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${v.status === "VOID" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {v.status === "VOID" ? "Deleted" : "Posted"}
                      </span>
                    </td>
                    {admin && (
                      <td className="text-right">
                        <VoucherAdminActions v={v} canEdit={rightOn(v.type_code, "edit")} canDelete={rightOn(v.type_code, "delete")} onResult={setMsg} onChanged={() => { setDetail({}); setOpen(null); load(); }} />
                      </td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="bg-[#fafafa] hover:bg-[#fafafa]">
                      <td />
                      <td colSpan={cols - 1} className="pb-4">
                        {!d ? (
                          <span className="inline-flex items-center gap-2 text-sm text-[#a3a3a3]"><Spinner />Loading…</span>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-xs text-[#737373]">
                              {d.created_by ? `Posted by ${d.created_by}` : "Posted"} on {showDate(d.created_at.slice(0, 10))}
                              {d.notes ? ` · ${d.notes}` : ""}
                            </div>
                            <table className="w-full overflow-hidden rounded-lg border border-[#e5e5e5] bg-white text-[13px]">
                              <thead>
                                <tr className="text-left text-xs text-[#737373]">
                                  <th className="px-3 py-2 font-medium">Item</th>
                                  <th className="px-3 py-2 font-medium">Type</th>
                                  <th className="px-3 py-2 font-medium">Department</th>
                                  <th className="px-3 py-2 text-right font-medium">In</th>
                                  <th className="px-3 py-2 text-right font-medium">Out</th>
                                  <th className="px-3 py-2 font-medium">Unit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.lines.length === 0 && <tr><td colSpan={6} className="px-3 py-2 text-[#a3a3a3]">No stock movement.</td></tr>}
                                {d.lines.map((l, i) => (
                                  <tr key={i} className="border-t border-[#f0f0f0]">
                                    <td className="px-3 py-1.5 font-medium">{l.item}</td>
                                    <td className="px-3 py-1.5 text-[#737373]">{l.item_type}</td>
                                    <td className="px-3 py-1.5 text-[#737373]">{l.department}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{l.qty_in ? `+${fmt.format(l.qty_in)}` : ""}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-rose-700">{l.qty_out ? `−${fmt.format(l.qty_out)}` : ""}</td>
                                    <td className="px-3 py-1.5 text-[#737373]">{l.unit}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows && rows.length >= 500 && <p className="mt-2 text-xs text-[#737373]">Showing the latest 500. Narrow the dates to see older vouchers.</p>}
    </div>
  );
}
