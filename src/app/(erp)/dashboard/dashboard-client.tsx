"use client";

import { todayISO } from "@/lib/dates";
import { DashboardSkeleton } from "@/components/skeleton";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { COLORS, ChartSummary, Donut, HBars, Sparkline, StackedColumns, short } from "@/app/(erp)/dashboard/charts";

type Kpis = {
  ok_pcs: number;
  gross_pcs: number;
  yield_pct: number;
  weight_kg: number;
  avg_unit_kg: number;
  running_sizes: number;
  repair: number;
  second: number;
  scrap: number;
  rejection: number;
  rejection_pct: number;
};
type Row = {
  product_id: number;
  size: string;
  valve: string;
  segment: string;
  gross: number;
  repair: number;
  second: number;
  scrap: number;
  rejection: number;
  ok: number;
  unit_kg: number | null;
  weight_kg: number;
  yield_pct: number | null;
};
type Day = {
  date: string;
  gross: number;
  ok: number;
  rejection: number;
  repair: number;
  second: number;
  scrap: number;
  weight_kg: number;
  packed: number;
  purchase_kg: number;
  master_kg: number;
  final_kg: number;
  vouchers: number;
};
type Plant = {
  material_kg: number;
  material_count: number;
  short_count: number;
  materials: { id: number; code: string; name: string; stock_kg: number; min_kg: number; short: boolean; empty: boolean }[];
  master_kg: number;
  final_kg: number;
  master_count: number;
  final_count: number;
  batches: { batch_no: string; batch_type: string; available_kg: number; status: string }[];
  purchase_kg: number;
  purchase_count: number;
  fg_pcs: number;
  fg_kg: number;
  wip_pcs: number;
  departments: { code: string; pcs: number }[];
  rejections: { department: string; repair: number; second: number; scrap: number; total: number }[];
  activity: { type: string; count: number }[];
  recent: { voucher_no: string; type: string; date: string; input: number; output: number; status: string }[];
  alerts: { level: "warn" | "info"; text: string; href: string }[];
};
type Overview = {
  from: string;
  to: string;
  catalog: number;
  kpis: Kpis;
  previous: Kpis;
  segments: { name: string; ok_pcs: number; share: number }[];
  valves: { valve: string; units: number }[];
  rows: Row[];
  pipeline: { code: string; name: string; pcs: number }[];
  series: Day[];
  plant: Plant;
  store: { id: number; name: string; group: string; unit: string; stock: number }[];
};

type Preset = "today" | "7d" | "30d" | "month" | "custom";

const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const kgf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

function localISO(d = new Date()) {
  return todayISO(d);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function pretty(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}
function rangeFor(p: Preset, custom: { from: string; to: string }) {
  const today = localISO();
  if (p === "today") return { from: today, to: today };
  if (p === "7d") return { from: addDays(today, -6), to: today };
  if (p === "30d") return { from: addDays(today, -29), to: today };
  if (p === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return custom;
}
/** Percent change against the previous period. null when there was nothing to compare with. */
function change(cur: number, prev: number) {
  if (!(prev > 0)) return null;
  return ((cur - prev) / prev) * 100;
}

const PRESETS: [Preset, string][] = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["month", "This month"],
  ["custom", "Custom"],
];

export function DashboardClient({ perms = [] }: { username: string; role: string; perms?: string[] }) {
  // Links go only to pages this user may open.
  const link = (h?: string) => (h && perms.includes(`${h.split("?")[0].slice(1)}.view`) ? h : undefined);
  const today = localISO();
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rank, setRank] = useState<"ok" | "weight">("ok");
  const [query, setQuery] = useState("");
  const [valve, setValve] = useState("all");
  const [state, setState] = useState<"all" | "produced" | "idle">("produced");

  const range = rangeFor(preset, custom);
  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      setData(await api<Overview>(`/api/dashboard/overview?from=${from}&to=${to}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (range.from && range.to && range.from <= range.to) load(range.from, range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, load]);

  const valves = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.valve))].sort(), [data]);
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (state === "produced" && r.gross === 0 && r.rejection === 0) return false;
      if (state === "idle" && (r.gross > 0 || r.rejection > 0)) return false;
      if (valve !== "all" && r.valve !== valve) return false;
      return !q || `${r.size} ${r.valve}`.toLowerCase().includes(q);
    });
  }, [data, query, valve, state]);
  const topSizes = useMemo(() => {
    if (!data) return [];
    return [...data.rows]
      .filter((r) => (rank === "ok" ? r.ok > 0 : r.weight_kg > 0))
      .sort((a, b) => (rank === "ok" ? b.ok - a.ok : b.weight_kg - a.weight_kg))
      .slice(0, 8);
  }, [data, rank]);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#0a0a0a]">Plant overview</h2>
        <p className="text-sm text-[#737373]">
          {pretty(range.from)} to {pretty(range.to)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[#e5e5e5] bg-[#f5f5f5] p-0.5 text-sm">
          {PRESETS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${preset === id ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#737373] hover:text-[#0a0a0a]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input className="erp-input mt-0 !h-9 w-[140px]" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <span className="text-[#a3a3a3]">–</span>
            <input className="erp-input mt-0 !h-9 w-[140px]" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </div>
        )}
        <button type="button" className="erp-btn erp-btn-secondary !m-0" onClick={() => load(range.from, range.to)} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );

  if (error && !data) return <div className="space-y-4">{header}<p className="text-sm text-red-700">{error}</p></div>;
  if (!data) return <div className="space-y-4">{header}<DashboardSkeleton /></div>;

  const k = data.kpis;
  const p = data.previous;
  const pl = data.plant;
  const s = data.series;
  const yieldDay = (d: Day) => (d.gross > 0 ? (d.ok / d.gross) * 100 : null);
  const rejDay = (d: Day) => (d.gross > 0 ? (d.rejection / d.gross) * 100 : 0);

  // What needs the admin's attention first.
  const attention: { level: "warn" | "info"; text: string; href: string }[] = [...pl.alerts.filter((a) => a.level === "warn")];
  const outStore = data.store.filter((i) => i.stock <= 0).length;
  if (outStore > 0) attention.push({ level: "warn", text: `${outStore} store item${outStore === 1 ? " is" : "s are"} out of stock`, href: "/materials" });
  if (p.gross_pcs > 0 && k.yield_pct < p.yield_pct - 1) attention.push({ level: "warn", text: `Yield fell ${(p.yield_pct - k.yield_pct).toFixed(1)} points against the previous period`, href: "/rejections" });
  if (k.rejection_pct > 5) attention.push({ level: "warn", text: `Rejection is ${k.rejection_pct.toFixed(1)}% of gross output`, href: "/rejections" });
  for (const a of pl.alerts.filter((a) => a.level === "info").slice(0, 2)) attention.push(a);

  const pipelineOrder = ["EXTRUSION", "CURED", "QC", "FG"];
  const pipeline = [...data.pipeline].sort((a, b) => pipelineOrder.indexOf(a.code) - pipelineOrder.indexOf(b.code));
  const rejSlices = [
    { label: "Repair", value: k.repair, color: COLORS.sky },
    { label: "Second", value: k.second, color: COLORS.amber },
    { label: "Scrap", value: k.scrap, color: COLORS.bad },
  ];
  const segColors = [COLORS.ink, COLORS.ok, COLORS.amber, COLORS.sky];
  const totals = filtered.reduce((t, r) => ({ gross: t.gross + r.gross, ok: t.ok + r.ok, rejection: t.rejection + r.rejection, weight: t.weight + r.weight_kg }), { gross: 0, ok: 0, rejection: 0, weight: 0 });

  return (
    <div className="space-y-5">
      {header}

      {/* Attention */}
      <div className="flex flex-wrap gap-2">
        {attention.length === 0 && <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">Nothing needs attention right now.</span>}
        {attention.slice(0, 6).map((a) => (
          <Link
            key={a.text}
            href={link(a.href) ?? "#"}
            aria-disabled={!link(a.href)}
            onClick={(e) => { if (!link(a.href)) e.preventDefault(); }}
            className={`rounded-lg border px-3 py-1.5 text-sm no-underline ${link(a.href) ? "" : "pointer-events-none"} ${a.level === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[#e5e5e5] bg-[#fafafa] text-[#404040]"}`}
          >
            {a.level === "warn" ? "⚠ " : ""}
            {a.text}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="OK production" value={num.format(k.ok_pcs)} unit="pcs" delta={change(k.ok_pcs, p.ok_pcs)} spark={s.map((d) => d.ok)} sub={`${num.format(k.gross_pcs)} gross`} />
        <Kpi label="Yield" value={k.yield_pct.toFixed(1)} unit="%" delta={k.gross_pcs > 0 && p.gross_pcs > 0 ? k.yield_pct - p.yield_pct : null} deltaUnit="pts" spark={s.map((d) => yieldDay(d) ?? 0)} color={COLORS.ok} sub="OK against gross" />
        <Kpi label="Rejection" value={k.rejection_pct.toFixed(1)} unit="%" delta={k.gross_pcs > 0 && p.gross_pcs > 0 ? k.rejection_pct - p.rejection_pct : null} deltaUnit="pts" invert spark={s.map(rejDay)} color={COLORS.bad} sub={`${num.format(k.rejection)} pcs`} />
        <Kpi label="Output weight" value={dec.format(k.weight_kg / 1000)} unit="MT" delta={change(k.weight_kg, p.weight_kg)} spark={s.map((d) => d.weight_kg)} color={COLORS.amber} sub={`${dec.format(k.avg_unit_kg)} kg per tube`} />
        <Kpi label="Compound ready" value={kgf.format(pl.master_kg + pl.final_kg)} unit="kg" href={link("/mixing")} sub={`${kgf.format(pl.master_kg)} master · ${kgf.format(pl.final_kg)} final`} />
        <Kpi label="Finished goods" value={num.format(pl.fg_pcs)} unit="pcs" href={link("/stock")} spark={s.map((d) => d.packed)} color={COLORS.sky} sub={`${kgf.format(pl.fg_kg)} kg estimated`} />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Raw material in store" value={`${kgf.format(pl.material_kg)} kg`} sub={`${pl.material_count} items${pl.short_count ? ` · ${pl.short_count} low` : ""}`} warn={pl.short_count > 0} href={link("/materials")} />
        <Stat label="Raw material received" value={`${kgf.format(pl.purchase_kg)} kg`} sub={`${pl.purchase_count} receipts`} href={link("/materials")} />
        <Stat label="Tubes in process" value={`${num.format(pl.wip_pcs)} pcs`} sub="Between extrusion and finished goods" href={link("/stock")} />
        <Stat label="Vouchers posted" value={num.format(s.reduce((sum, d) => sum + d.vouchers, 0))} sub={`${data.catalog} sizes in catalog · ${k.running_sizes} running`} href={link("/vouchers")} />
      </section>

      {/* Trend + pipeline */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Production trend" sub="OK and rejected tubes per day, with yield" className="xl:col-span-2">
          <StackedColumns
            days={s.map((d) => ({ date: d.date, ok: d.ok, rejection: d.rejection, yield: yieldDay(d) }))}
            bars={[
              { key: "ok", label: "OK pcs", color: COLORS.ink },
              { key: "rejection", label: "Rejected pcs", color: COLORS.bad },
            ]}
            line={{ key: "yield", label: "Yield %", color: COLORS.ok }}
          />
        </Card>
        <Card title="Where the tubes are" sub="Pieces held at each stage right now" href={link("/stock")} action="Department stock">
          {pipeline.every((d) => d.pcs <= 0) ? (
            <Empty text="No tube stock yet. Opening stock or extrusion will fill this." />
          ) : (
            <HBars
              rows={pipeline.map((d) => ({ label: d.name.replace(" WIP", ""), value: d.pcs, color: d.code === "FG" ? COLORS.ok : COLORS.ink }))}
              fmt={(v) => `${num.format(v)} pcs`}
            />
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[#fafafa] p-2.5"><div className="text-[#737373]">Gross at extrusion</div><div className="mt-0.5 text-sm font-semibold">{num.format(k.gross_pcs)} pcs</div></div>
            <div className="rounded-lg bg-[#fafafa] p-2.5"><div className="text-[#737373]">Packed to finished goods</div><div className="mt-0.5 text-sm font-semibold">{num.format(s.reduce((sum, d) => sum + d.packed, 0))} pcs</div></div>
          </div>
        </Card>
      </section>

      {/* Quality + mix */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Rejections" sub="Repair, second and scrap" href={link("/rejections")} action="Register">
          {k.rejection === 0 ? (
            <Empty text="No repair, second or scrap in this period." />
          ) : (
            <Donut slices={rejSlices} center={{ top: `${k.rejection_pct.toFixed(1)}%`, bottom: "of gross" }} />
          )}
          {pl.rejections.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-[#f0f0f0] pt-3 text-sm">
              {pl.rejections.map((r) => (
                <li key={r.department} className="flex justify-between">
                  <span className="text-[#404040]">{r.department}</span>
                  <span className="tabular-nums text-[#737373]"><b className="text-[#171717]">{num.format(r.total)}</b> pcs</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Product mix" sub="OK pieces by vehicle segment">
          {k.ok_pcs === 0 ? (
            <Empty text="No production posted in this period." />
          ) : (
            <Donut
              slices={data.segments.map((x, i) => ({ label: x.name, value: x.ok_pcs, color: segColors[i % segColors.length] }))}
              center={{ top: short(k.ok_pcs), bottom: "OK pcs" }}
            />
          )}
          {data.valves.length > 0 && (
            <div className="mt-4 border-t border-[#f0f0f0] pt-3">
              <p className="mb-2 text-xs font-medium text-[#737373]">Valves used</p>
              <div className="flex flex-wrap gap-1.5">
                {data.valves.map((v) => (
                  <span key={v.valve} className="rounded-md bg-[#f5f5f5] px-2 py-1 text-xs text-[#404040]">{v.valve} <b>{num.format(v.units)}</b></span>
                ))}
              </div>
            </div>
          )}
        </Card>
        <Card
          title="Top sizes"
          sub={rank === "ok" ? "By OK pieces" : "By output weight"}
          action={
            <div className="flex rounded-md bg-[#f5f5f5] p-0.5 text-xs font-medium">
              <button type="button" className={`rounded px-2 py-1 ${rank === "ok" ? "bg-white shadow-sm" : "text-[#737373]"}`} onClick={() => setRank("ok")}>Pieces</button>
              <button type="button" className={`rounded px-2 py-1 ${rank === "weight" ? "bg-white shadow-sm" : "text-[#737373]"}`} onClick={() => setRank("weight")}>Weight</button>
            </div>
          }
        >
          {topSizes.length === 0 ? (
            <Empty text="No production posted in this period." />
          ) : (
            <HBars
              rows={topSizes.map((r) => ({ label: `${r.size} · ${r.valve}`, value: rank === "ok" ? r.ok : r.weight_kg }))}
              fmt={(v) => (rank === "ok" ? `${num.format(v)} pcs` : `${kgf.format(v)} kg`)}
            />
          )}
        </Card>
      </section>

      {/* Materials and compound */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Raw material stock" sub="Black tick is the minimum level" href={link("/materials")} action="Open store">
          {pl.materials.length === 0 ? (
            <Empty text="No raw materials in the master yet." />
          ) : (
            <HBars
              rows={pl.materials.slice(0, 9).map((m) => ({
                label: m.name,
                value: m.stock_kg,
                marker: m.min_kg,
                color: m.short || m.empty ? COLORS.bad : COLORS.ink,
              }))}
              fmt={(v) => `${kgf.format(v)} kg`}
            />
          )}
        </Card>
        <Card title="Compound mixed" sub="Master and final batch kg per day" href={link("/mixing")} action="Mixing">
          {s.every((d) => d.master_kg + d.final_kg <= 0) ? (
            <Empty text="No batches mixed in this period." />
          ) : (
            <StackedColumns
              height={230}
              unit=" kg"
              days={s.map((d) => ({ date: d.date, master: d.master_kg, final: d.final_kg }))}
              bars={[
                { key: "master", label: "Master", color: COLORS.violet },
                { key: "final", label: "Final", color: COLORS.sky },
              ]}
            />
          )}
          {s.some((d) => d.master_kg + d.final_kg > 0) && (
            <ChartSummary items={summarize(s, (d) => d.master_kg + d.final_kg, "kg")} />
          )}
        </Card>
        <Card title="Raw material received" sub="Kg per day" href={link("/materials")} action="Receive">
          {s.every((d) => d.purchase_kg <= 0) ? (
            <Empty text="No raw-material receipts in this period." />
          ) : (
            <StackedColumns height={230} unit=" kg" days={s.map((d) => ({ date: d.date, kg: d.purchase_kg }))} bars={[{ key: "kg", label: "Received kg", color: COLORS.amber }]} />
          )}
          {s.some((d) => d.purchase_kg > 0) && <ChartSummary items={summarize(s, (d) => d.purchase_kg, "kg")} />}
        </Card>
      </section>

      {/* Batches, store, activity */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Ready compound batches" sub={`${pl.master_count} master · ${pl.final_count} final`} href={link("/mixing")} action="Mixing">
          {pl.batches.length === 0 ? (
            <Empty text="No ready batch. Post a master mix, then a final batch." />
          ) : (
            <ul className="space-y-2">
              {pl.batches.slice(0, 8).map((b) => (
                <li key={b.batch_no} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.batch_type === "MASTER" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>{b.batch_type === "MASTER" ? "MASTER" : "FINAL"}</span>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate font-medium" title={b.batch_no}>{b.batch_no.replace(/-\d{6}-\d{4}$/, "")}</span>
                      <span className="block text-xs text-[#a3a3a3]">{/\d{6}-\d{4}$/.exec(b.batch_no)?.[0] ?? ""}</span>
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-[#737373]">{kgf.format(b.available_kg)} kg</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Packing store" sub="Lowest stock first" href={link("/materials")} action="Receive">
          {data.store.length === 0 ? (
            <Empty text="No store items in Item Master." />
          ) : (
            <ul className="space-y-2">
              {data.store.slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium" title={i.name}>{i.name}</span>
                  <span className={`tabular-nums ${i.stock <= 0 ? "rounded bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700" : "text-[#737373]"}`}>
                    {i.stock <= 0 ? "Out" : `${kgf.format(i.stock)} ${i.unit}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Latest vouchers" sub="Most recent postings" href={link("/vouchers")} action="Register">
          {pl.recent.length === 0 ? (
            <Empty text="Nothing posted yet." />
          ) : (
            <ul className="space-y-2">
              {pl.recent.map((v) => (
                <li key={v.voucher_no} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <b className="font-medium">{v.voucher_no}</b>
                    <span className="block truncate text-xs text-[#a3a3a3]">{v.type.replaceAll("_", " ")} · {pretty(v.date)}</span>
                  </span>
                  <span className="tabular-nums text-[#737373]">{v.output ? `${num.format(v.output)} out` : v.input ? `${num.format(v.input)} in` : "—"}</span>
                </li>
              ))}
            </ul>
          )}
          {pl.activity.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#f0f0f0] pt-3">
              {pl.activity.map((a) => (
                <span key={a.type} className="rounded-md bg-[#f5f5f5] px-2 py-1 text-xs text-[#404040]">{a.type.replaceAll("_", " ").toLowerCase()} <b>{a.count}</b></span>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Size table */}
      <section className="erp-panel !p-0 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <h3 className="text-base font-semibold text-[#0a0a0a]">Production by size</h3>
            <p className="mt-0.5 text-xs text-[#737373]">
              {filtered.length} of {data.rows.length} sizes · {pretty(range.from)} to {pretty(range.to)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[#e5e5e5] bg-[#f5f5f5] p-0.5 text-xs font-medium">
              {([["produced", "Produced"], ["idle", "No production"], ["all", "All"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setState(id)} className={`rounded-md px-3 py-1.5 ${state === id ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#737373] hover:text-[#0a0a0a]"}`}>{label}</button>
              ))}
            </div>
            <select className="erp-input" style={{ width: 150, height: 36, marginTop: 0 }} value={valve} onChange={(e) => setValve(e.target.value)}>
              <option value="all">All valves</option>
              {valves.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input className="erp-input" style={{ width: 200, height: 36, marginTop: 0 }} placeholder="Search size or valve" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-px border-y border-[#ececec] bg-[#ececec] md:grid-cols-5">
            {[
              ["Gross", num.format(totals.gross)],
              ["OK", num.format(totals.ok)],
              ["Rejected", num.format(totals.rejection)],
              ["Weight", `${dec.format(totals.weight)} kg`],
              ["Yield", totals.gross > 0 ? `${((totals.ok / totals.gross) * 100).toFixed(1)}%` : "–"],
            ].map(([l, v]) => (
              <div key={l} className="bg-[#fafafa] px-5 py-3">
                <div className="text-[11px] uppercase tracking-wide text-[#a3a3a3]">{l}</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums text-[#0a0a0a]">{v}</div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-[#404040]">{state === "produced" ? "No production posted in this period" : "No sizes match"}</p>
            <p className="mt-1 text-xs text-[#a3a3a3]">
              {state === "produced" ? "Post an extrusion entry, or switch to All to see every size in the catalog." : "Try a different search or filter."}
            </p>
            {state === "produced" && <button type="button" className="erp-btn erp-btn-secondary mt-4" onClick={() => setState("all")}>Show all sizes</button>}
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-[#ececec] text-left text-[11px] uppercase tracking-wide text-[#a3a3a3]">
                  <th className="px-5 py-2.5 font-medium">Size</th>
                  <th className="px-3 py-2.5 font-medium">Valve</th>
                  <th className="px-3 py-2.5 font-medium">Segment</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gross</th>
                  <th className="px-3 py-2.5 text-right font-medium">Repair</th>
                  <th className="px-3 py-2.5 text-right font-medium">Second</th>
                  <th className="px-3 py-2.5 text-right font-medium">Scrap</th>
                  <th className="px-3 py-2.5 text-right font-medium">OK</th>
                  <th className="px-3 py-2.5 text-right font-medium">Kg / pc</th>
                  <th className="px-3 py-2.5 text-right font-medium">Weight kg</th>
                  <th className="px-5 py-2.5 font-medium" style={{ minWidth: 150 }}>Yield</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const y = r.yield_pct;
                  const tone = y == null ? COLORS.axis : y >= 97 ? COLORS.ok : y >= 95 ? COLORS.amber : COLORS.bad;
                  return (
                    <tr key={r.product_id} className="border-b border-[#f3f3f3] transition-colors hover:bg-[#fafafa]">
                      <td className="px-5 py-3 font-semibold text-[#0a0a0a]">{r.size}</td>
                      <td className="px-3 py-3 text-[#404040]">{r.valve}</td>
                      <td className="px-3 py-3"><span className="rounded-md bg-[#f5f5f5] px-2 py-0.5 text-xs text-[#525252]">{r.segment}</span></td>
                      <td className="px-3 py-3 text-right tabular-nums">{num.format(r.gross)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#737373]">{r.repair || "–"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#737373]">{r.second || "–"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#737373]">{r.scrap || "–"}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{num.format(r.ok)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[#737373]">{r.unit_kg == null ? "–" : r.unit_kg.toFixed(3)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{dec.format(r.weight_kg)}</td>
                      <td className="px-5 py-3">
                        {y == null ? <span className="text-[#a3a3a3]">–</span> : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0f0f0]"><div className="h-full rounded-full" style={{ width: `${Math.min(y, 100)}%`, background: tone }} /></div>
                            <span className="w-12 text-right text-xs font-semibold tabular-nums" style={{ color: tone }}>{y.toFixed(1)}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function summarize(s: Day[], f: (d: Day) => number, unit: string) {
  const vals = s.map(f);
  const total = vals.reduce((a, b) => a + b, 0);
  const active = vals.filter((v) => v > 0).length;
  let peak = 0;
  vals.forEach((v, i) => { if (v > vals[peak]) peak = i; });
  return [
    { label: "Total", value: `${kgf.format(total)} ${unit}` },
    { label: "Daily average", value: `${kgf.format(total / Math.max(s.length, 1))} ${unit}`, sub: `${active} active day${active === 1 ? "" : "s"}` },
    { label: "Peak day", value: `${kgf.format(vals[peak] ?? 0)} ${unit}`, sub: s[peak] ? pretty(s[peak].date) : undefined },
    { label: "Share of days", value: `${Math.round((active / Math.max(s.length, 1)) * 100)}%`, sub: "with activity" },
  ];
}

function Card({
  title,
  sub,
  href,
  action,
  className = "",
  children,
}: {
  title: string;
  sub?: string;
  href?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`erp-panel ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#0a0a0a]">{title}</h3>
          {sub && <p className="text-xs text-[#737373]">{sub}</p>}
        </div>
        {href && typeof action === "string" ? <Link href={href} className="shrink-0 text-xs font-medium text-[#404040] underline-offset-2 hover:underline">{action}</Link> : action}
      </div>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  delta,
  deltaUnit = "%",
  invert = false,
  spark,
  color,
  sub,
  href,
}: {
  label: string;
  value: string;
  unit: string;
  delta?: number | null;
  deltaUnit?: "%" | "pts";
  invert?: boolean;
  spark?: number[];
  color?: string;
  sub?: string;
  href?: string;
}) {
  const good = delta == null ? null : invert ? delta <= 0 : delta >= 0;
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#737373]">{label}</p>
        {delta != null && Math.abs(delta) >= 0.05 && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`} title="Against the previous period of the same length">
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}{deltaUnit === "%" ? "%" : " pts"}
          </span>
        )}
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-[#0a0a0a]">
        {value} <span className="text-sm font-medium text-[#a3a3a3]">{unit}</span>
      </p>
      {sub && <p className="mt-1.5 truncate text-xs text-[#737373]">{sub}</p>}
      {spark && spark.length > 1 && <div className="mt-2"><Sparkline values={spark} color={color} /></div>}
    </>
  );
  const cls = "erp-panel !p-4 block no-underline text-inherit";
  return href ? <Link href={href} className={`${cls} transition-colors hover:bg-[#fafafa]`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Stat({ label, value, sub, href, warn = false }: { label: string; value: string; sub: string; href?: string; warn?: boolean }) {
  const body = (
    <>
      <p className="text-xs text-[#737373]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-[#0a0a0a]">{value}</p>
      <p className={`truncate text-xs ${warn ? "font-medium text-amber-700" : "text-[#a3a3a3]"}`}>{sub}</p>
    </>
  );
  const cls = "rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 no-underline";
  return href ? <Link href={href} className={`${cls} transition-colors hover:bg-[#f5f5f5]`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg bg-[#fafafa] px-3 py-6 text-center text-sm text-[#a3a3a3]">{text}</p>;
}
