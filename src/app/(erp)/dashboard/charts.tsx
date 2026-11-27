"use client";

import { useEffect, useRef, useState } from "react";

export const COLORS = {
  ink: "#171717",
  ok: "#10b981",
  bad: "#f43f5e",
  amber: "#f59e0b",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  grid: "#ececec",
  axis: "#a3a3a3",
};

/** 1250 -> 1.25k, 1_200_000 -> 1.2M. Short labels for chart axes. */
export function short(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${+(v / 1000).toFixed(0)}k`;
  if (a >= 1000) return `${+(v / 1000).toFixed(1)}k`;
  return `${+v.toFixed(a < 10 ? 1 : 0)}`;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return n * p;
}

const dm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

export type Bar = { key: string; label: string; color: string };

/**
 * Stacked columns per day with an optional line on a 0-100% axis (for yield).
 * Hover a column for the exact numbers.
 */
export function StackedColumns({
  days,
  bars,
  line,
  unit = "",
  height = 240,
}: {
  days: ({ date: string } & Record<string, number | string | null>)[];
  bars: Bar[];
  line?: { key: string; label: string; color: string };
  unit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => setW(Math.max(Math.round(el.clientWidth), 240));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const pad = { l: 40, r: line ? 40 : 12, t: 12, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const totals = days.map((d) => bars.reduce((s, b) => s + Number(d[b.key] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 1));
  const step = iw / Math.max(days.length, 1);
  const bw = Math.min(Math.max(step * 0.62, 3), 34);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const every = Math.ceil(days.length / Math.max(Math.floor(iw / 48), 1));
  const linePts = line
    ? days
        .map((d, i) => ({ i, v: d[line.key] }))
        .filter((p) => p.v != null)
        .map((p) => `${pad.l + step * p.i + step / 2},${pad.t + ih - (Number(p.v) / 100) * ih}`)
    : [];
  const h = hover != null ? days[hover] : null;

  return (
    <div className="relative" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={COLORS.grid} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="11" fill={COLORS.axis}>{short(t)}</text>
          </g>
        ))}
        {line &&
          [0, 50, 100].map((t) => (
            <text key={t} x={W - pad.r + 6} y={pad.t + ih - (t / 100) * ih + 3} fontSize="11" fill={COLORS.axis}>{t}%</text>
          ))}
        {days.map((d, i) => {
          let acc = 0;
          const x = pad.l + step * i + (step - bw) / 2;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + step * i} y={pad.t} width={step} height={ih} fill={hover === i ? "#00000008" : "transparent"} />
              {bars.map((b) => {
                const v = Number(d[b.key] ?? 0);
                const top = y(acc + v);
                const hgt = y(acc) - top;
                acc += v;
                return hgt > 0 ? <rect key={b.key} x={x} y={top} width={bw} height={hgt} fill={b.color} rx={bw > 8 ? 2 : 0} /> : null;
              })}
              {i % every === 0 && (
                <text x={pad.l + step * i + step / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={COLORS.axis}>{dm(d.date)}</text>
              )}
            </g>
          );
        })}
        {linePts.length > 1 && <polyline points={linePts.join(" ")} fill="none" stroke={line!.color} strokeWidth="2" strokeLinejoin="round" />}
        {line && linePts.length === 1 && <circle cx={linePts[0].split(",")[0]} cy={linePts[0].split(",")[1]} r="3" fill={line.color} />}
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${Math.min(Math.max(((pad.l + step * hover + step / 2) / W) * 100, 14), 82)}%`, transform: "translateX(-50%)" }}
        >
          <div className="mb-1 font-semibold text-[#171717]">{dm(String(h.date))}</div>
          {bars.map((b) => (
            <div key={b.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[#737373]"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: b.color }} />{b.label}</span>
              <b>{short(Number(h[b.key] ?? 0))}{unit}</b>
            </div>
          ))}
          {line && (
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[#737373]"><i className="inline-block h-0.5 w-2" style={{ background: line.color }} />{line.label}</span>
              <b>{h[line.key] == null ? "–" : `${Number(h[line.key]).toFixed(1)}%`}</b>
            </div>
          )}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-4 px-1 text-xs text-[#737373]">
        {bars.map((b) => (
          <span key={b.key} className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />{b.label}</span>
        ))}
        {line && <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-3" style={{ background: line.color }} />{line.label}</span>}
      </div>
    </div>
  );
}

/** Tiny trend line for a KPI card. */
export function Sparkline({ values, color = COLORS.ink }: { values: number[]; color?: string }) {
  const W = 120;
  const H = 36;
  if (values.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-full" aria-hidden />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 8)]);
  const line = pts.map((p) => p.join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={color} opacity="0.08" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Donut({
  slices,
  center,
  size = 150,
}: {
  slices: { label: string; value: number; color: string }[];
  center?: { top: string; bottom: string };
  size?: number;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f0f0f0" strokeWidth="16" />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={s.label}
                  cx="70"
                  cy="70"
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="16"
                  strokeDasharray={`${Math.max(len - 1.5, 0)} ${c}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        {center && (
          <div className="absolute inset-0 grid place-content-center text-center">
            <div className="text-xl font-semibold leading-none text-[#171717]">{center.top}</div>
            <div className="mt-1 text-[11px] text-[#737373]">{center.bottom}</div>
          </div>
        )}
      </div>
      <ul className="min-w-[120px] flex-1 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[#404040]"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
            <span className="tabular-nums text-[#737373]">
              <b className="text-[#171717]">{short(s.value)}</b> <span className="text-xs">{total > 0 ? `${((s.value / total) * 100).toFixed(0)}%` : "–"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars. `marker` draws a tick (for example the minimum stock). */
export function HBars({
  rows,
  color = COLORS.ink,
  fmt = short,
}: {
  rows: { label: string; value: number; marker?: number; color?: string; note?: string }[];
  color?: string;
  fmt?: (v: number) => string;
}) {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.marker ?? 0)), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(80px,32%)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate font-medium text-[#171717]" title={r.label}>{r.label}</span>
          <span className="relative h-2.5 overflow-hidden rounded-full bg-[#f2f2f2]">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.max(r.value, 0) / max) * 100}%`, background: r.color ?? color }} />
            {r.marker != null && r.marker > 0 && <span className="absolute inset-y-0 w-0.5 bg-[#171717]" style={{ left: `${(r.marker / max) * 100}%` }} title={`Minimum ${fmt(r.marker)}`} />}
          </span>
          <span className="min-w-[64px] text-right tabular-nums text-[#737373]">{fmt(r.value)}{r.note ? <span className="ml-1 text-[11px]">{r.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

/** Small totals row shown under a per-day chart. */
export function ChartSummary({ items }: { items: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#f0f0f0] pt-3">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg bg-[#fafafa] p-2.5">
          <div className="text-xs text-[#737373]">{i.label}</div>
          <div className="mt-0.5 text-sm font-semibold text-[#0a0a0a]">{i.value}</div>
          {i.sub && <div className="truncate text-[11px] text-[#a3a3a3]">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}
