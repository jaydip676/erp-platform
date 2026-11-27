"use client";

import { IconAction } from "@/components/icon-action";
import { Modal } from "@/components/modal";
import { AddButton } from "@/components/add-button";
import { Select } from "@/components/select";
import { ExpandIcon } from "@/components/expand-icon";
import { DateInput } from "@/components/date-input";
import { Busy } from "@/components/spinner";
import { useDateAllowed, useDateLimits } from "@/components/entry-window";
import { useEffect, useMemo, useState } from "react";
import { SkeletonTable } from "@/components/skeleton";
import { api, ApiClientError } from "@/lib/client-api";
import { useSubmit } from "@/lib/use-submit";
import { Banner } from "@/components/banner";
import { Tabs } from "@/components/tabs";
import { useConfirm } from "@/components/confirm";
import { showDate, todayISO } from "@/lib/dates";
import { masterGroup } from "@/lib/erp/codes";

type Material = { id: number; code: string; name: string };
type InvItem = { id: number; name: string; group: string; unit: string };
type CatalogRow = { size: string; valve?: string };
type Product = { id: number; size: string; valve_type: string; brand?: string };
type Brand = { id: number; name: string };
type Formula = { id: number; code: string; name: string | null; batch_type: string };
type StockRow = { itemType: string; itemId: number; department: string; balance: number };
type OpeningLine = { category: string; item: string; qty: number; unit: string };
type Opening = { voucher_no: string; date: string; status: string; notes: string | null; by: string; lines: OpeningLine[] };
type BatchRow = { key: number; formula_id: number | ""; master_group: string; kg: string; count: string };

type TabId = "raw" | "store" | "green" | "cured" | "qc" | "fg" | "reject" | "master" | "final";
const TUBE_TABS: Record<"green" | "cured" | "qc" | "fg", { dept: string; label: string }> = {
  green: { dept: "EXTRUSION", label: "Green Tube" },
  cured: { dept: "CURED", label: "Cured Tube (Press)" },
  qc: { dept: "QC", label: "Quality Approved (Unpacked)" },
  fg: { dept: "FG", label: "Finished Goods" },
};
const TAB_HINT: Record<TabId, string> = {
  raw: "KG of each raw material in the store.",
  store: "Pouches, nut/washer/cap, valve pins, bags and other packing store items, in their own unit.",
  green: "Green tubes from Step 1 waiting for the press. These have no valve yet, so they are counted by size.",
  cured: "Pressed tubes from Step 2 waiting for inspection, by size and valve.",
  qc: "Inspected OK tubes from Step 3 waiting to be packed, by size and valve.",
  fg: "Packed finished goods, by size, valve and brand. Select the size, valve and brand, enter the PCS and press Add.",
  reject: "Repair, Second and Scrap pieces on hand. They go to the Rejections register and are not counted as production.",
  master: "Master batches on the floor. Each batch gets its own number and joins its formula group, so final batches use them oldest first.",
  final: "Final batches on the floor. Each batch joins its group (final formula + master group), so Step 1 uses them oldest first.",
};
const DRAFT_KEY = "viaz-opening-draft-v1";

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmt = (n: number) => Number(n.toFixed(3)).toLocaleString("en-IN");
const tagOf = (f: Formula) => (f.name || f.code).toUpperCase().replace(/[^A-Z0-9]+/g, "") || "MN";
const stampOf = (iso: string) => iso.slice(2).replaceAll("-", "");

export function OpeningClient({ isAdmin, canDelete = isAdmin }: { isAdmin: boolean; canDelete?: boolean }) {
  // Opening stock entries are only added and removed here, so "isAdmin" is the Add right.
  const dateOk = useDateAllowed();
  const limits = useDateLimits();
  const [entering, setEntering] = useState(false);
  const confirm = useConfirm();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [masterGroups, setMasterGroups] = useState<string[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<TabId>("raw");
  const [q, setQ] = useState("");
  const [pickSize, setPickSize] = useState("");
  const [pickValve, setPickValve] = useState("");
  const [pickBrand, setPickBrand] = useState("");
  const [pickQty, setPickQty] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [masters, setMasters] = useState<BatchRow[]>([]);
  const [finals, setFinals] = useState<BatchRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const loadLists = () => {
    api<Opening[]>("/api/opening-stock").then(setOpenings).catch(() => setOpenings([]));
    api<Product[]>("/api/products").then((r) => setProducts(Array.isArray(r) ? r : [])).catch(() => undefined);
    api<StockRow[]>("/api/stock").then((r) => setStock(Array.isArray(r) ? r : [])).catch(() => setStock([]));
    api<{ batch_no: string }[]>("/api/batches?type=MASTER&all=1")
      .then((rows) => setMasterGroups([...new Set(rows.map((b) => masterGroup(b.batch_no)))]))
      .catch(() => setMasterGroups([]));
  };

  useEffect(() => {
    loadLists();
    Promise.allSettled([
      api<Material[]>("/api/materials").then(setMaterials).catch(() => setMaterials([])),
      api<InvItem[]>("/api/masters/inventory").then((r) => setInventory(Array.isArray(r) ? r : [])).catch(() => setInventory([])),
    ]).then(() => setDataReady(true));
    api<CatalogRow[]>("/api/catalog").then((r) => setCatalog(Array.isArray(r) ? r : [])).catch(() => setCatalog([]));
    api<Product[]>("/api/products").then((r) => setProducts(Array.isArray(r) ? r : [])).catch(() => setProducts([]));
    api<Brand[]>("/api/masters/qualities").then((r) => setBrands(Array.isArray(r) ? r : [])).catch(() => setBrands([]));
    api<Formula[]>("/api/masters/batches").then((r) => setFormulas(Array.isArray(r) ? r : [])).catch(() => setFormulas([]));
    // Bring back a draft that was not posted yet (this browser only).
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      const hasEntries = d && (Object.keys(d.qty ?? {}).length > 0 || d.masters?.length > 0 || d.finals?.length > 0);
      if (hasEntries) {
        if (d.date) setDate(d.date);
        if (d.notes) setNotes(d.notes);
        if (d.qty) setQty(d.qty);
        if (Array.isArray(d.masters)) setMasters(d.masters);
        if (Array.isArray(d.finals)) setFinals(d.finals);
      }
    } catch {
      /* no saved draft */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ date, notes, qty, masters, finals }));
    } catch {
      /* storage not available */
    }
  }, [loaded, date, notes, qty, masters, finals]);

  const storeItems = inventory.filter((i) => i.group === "Store Item" || i.group === "Pouch Item").sort((a, b) => a.name.localeCompare(b.name));
  const sizes = useMemo(() => [...new Set(inventory.filter((i) => i.group === "Finished Goods").map((i) => i.name).filter(Boolean))].sort(), [inventory]);
  const pairs = useMemo(() => {
    const sizeSet = new Set(sizes);
    const seen = new Set<string>();
    const out: { size: string; valve: string }[] = [];
    const add = (size: string, valve: string) => {
      const s = size.trim();
      const v = valve.trim();
      if (!s || !v || !sizeSet.has(s) || seen.has(`${s}|${v}`)) return;
      seen.add(`${s}|${v}`);
      out.push({ size: s, valve: v });
    };
    for (const c of catalog) add(c.size, c.valve ?? "");
    for (const p of products) add(p.size, p.valve_type);
    return out.sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }) || a.valve.localeCompare(b.valve));
  }, [catalog, products, sizes]);
  const masterFormulas = formulas.filter((f) => (f.batch_type || "MASTER") === "MASTER");
  const finalFormulas = formulas.filter((f) => f.batch_type === "FINAL");
  const groupOptions = useMemo(
    () => [...new Set([...masterFormulas.map((f) => `MB-${tagOf(f)}`), ...masterGroups, "MB-MN"])],
    [masterFormulas, masterGroups],
  );

  // What the system already holds, to spot double entries.
  const have = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of stock) m.set(`${r.itemType}|${r.itemId}|${r.department}`, (m.get(`${r.itemType}|${r.itemId}|${r.department}`) ?? 0) + r.balance);
    return m;
  }, [stock]);
  // Stock of a size / valve in a department. With a brand it is that brand only; without one it is all of them.
  const haveTube = (dept: string, size: string, valve: string, brand?: string) =>
    products
      .filter((p) => p.size === size && p.valve_type === valve && (brand === undefined || (p.brand ?? "") === brand))
      .reduce((sum, p) => sum + (have.get(`PRODUCT|${p.id}|${dept}`) ?? 0), 0);
  const haveRaw = (id: number) => have.get(`RAW|${id}|RAW`) ?? 0;
  const haveStore = (id: number) => have.get(`STORE|${id}|STORE`) ?? 0;

  const setOne = (key: string, value: string) => setQty((cur) => {
    const next = { ...cur };
    if (value === "") delete next[key];
    else next[key] = value;
    return next;
  });

  // Everything entered, as the lines the server expects, plus a summary per tab.
  const { lines, summary } = useMemo(() => {
    const lines: Record<string, unknown>[] = [];
    const summary: Record<TabId, { rows: number; total: number; unit: string }> = {
      raw: { rows: 0, total: 0, unit: "KG" }, store: { rows: 0, total: 0, unit: "" }, green: { rows: 0, total: 0, unit: "PCS" },
      cured: { rows: 0, total: 0, unit: "PCS" }, qc: { rows: 0, total: 0, unit: "PCS" }, fg: { rows: 0, total: 0, unit: "PCS" },
      reject: { rows: 0, total: 0, unit: "PCS" }, master: { rows: 0, total: 0, unit: "KG" }, final: { rows: 0, total: 0, unit: "KG" },
    };
    const deptTab: Record<string, TabId> = { EXTRUSION: "green", CURED: "cured", QC: "qc", FG: "fg" };
    const rejects = new Map<string, { size: string; valve: string; repair: number; second: number; scrap: number }>();
    for (const [key, value] of Object.entries(qty)) {
      const n = num(value);
      if (!n) continue;
      const p = key.split("|");
      if (p[0] === "RAW") { lines.push({ kind: "RAW", item_id: Number(p[1]), qty: n }); summary.raw.rows++; summary.raw.total += n; }
      else if (p[0] === "STORE") { lines.push({ kind: "STORE", item_id: Number(p[1]), qty: n }); summary.store.rows++; summary.store.total += n; }
      else if (p[0] === "PRODUCT") {
        lines.push({ kind: "PRODUCT", department: p[1], size: p[2], valve: p[3] ?? "", brand: p[4] ?? "", qty: Math.round(n) });
        const t = deptTab[p[1]];
        summary[t].rows++; summary[t].total += Math.round(n);
      } else if (p[0] === "REJECT") {
        const k = `${p[1]}|${p[2]}`;
        const r = rejects.get(k) ?? { size: p[1], valve: p[2], repair: 0, second: 0, scrap: 0 };
        r[p[3] as "repair" | "second" | "scrap"] = Math.round(n);
        rejects.set(k, r);
        summary.reject.total += Math.round(n);
      }
    }
    for (const r of rejects.values()) { lines.push({ kind: "REJECT", ...r }); summary.reject.rows++; }
    for (const b of masters) {
      const kg = num(b.kg); const count = Math.max(1, Math.round(num(b.count) || 1));
      if (!kg) continue;
      lines.push({ kind: "MASTER", formula_id: b.formula_id === "" ? null : b.formula_id, kg, count });
      summary.master.rows += count; summary.master.total += kg * count;
    }
    for (const b of finals) {
      const kg = num(b.kg); const count = Math.max(1, Math.round(num(b.count) || 1));
      if (!kg || !b.master_group) continue;
      lines.push({ kind: "FINAL", formula_id: b.formula_id === "" ? null : b.formula_id, master_group: b.master_group, kg, count });
      summary.final.rows += count; summary.final.total += kg * count;
    }
    return { lines, summary };
  }, [qty, masters, finals]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "raw", label: "Raw Material" },
    { id: "store", label: "Packing Store" },
    { id: "master", label: "Master Batches" },
    { id: "final", label: "Final Batches" },
    { id: "green", label: "Green Tube" },
    { id: "cured", label: "Cured Tube (Press)" },
    { id: "qc", label: "Quality Approved (Unpacked)" },
    { id: "fg", label: "Finished Goods" },
    { id: "reject", label: "Repair / Second / Scrap" },
  ];
  const tabLabel = (id: TabId) => tabs.find((t) => t.id === id)!.label;
  const filled = tabs.filter((t) => summary[t.id].rows > 0);
  const missingGroup = finals.some((b) => num(b.kg) > 0 && !b.master_group);
  const previous = openings.filter((o) => o.status !== "VOID");

  const [postOnce, posting] = useSubmit(post);
  async function post() {
    if (lines.length === 0) { setMsg({ ok: false, text: "Enter at least one quantity." }); return; }
    const ok = await confirm({
      title: `Post opening stock as on ${showDate(date)}?`,
      confirm: "Post opening stock",
      body: (
        <div className="space-y-2 text-sm">
          <ul className="space-y-1">
            {filled.map((t) => (
              <li key={t.id} className="flex justify-between gap-4">
                <span>{tabLabel(t.id)}</span>
                <span className="tabular-nums text-[#737373]">
                  {t.id === "master" || t.id === "final" ? `${summary[t.id].rows} batches · ` : `${summary[t.id].rows} rows · `}
                  {fmt(summary[t.id].total)} {summary[t.id].unit}
                </span>
              </li>
            ))}
          </ul>
          {previous.length > 0 && <p className="font-semibold text-amber-700">{previous.length} opening entr{previous.length === 1 ? "y is" : "ies are"} already posted. This adds to it.</p>}
          <p className="text-[#737373]">It posts as one opening voucher. You can remove it later as long as nothing from it has been used.</p>
        </div>
      ),
    });
    if (!ok) return;
    try {
      const d = await api<{ voucher_no: string; lines: number; batches: number }>("/api/opening-stock", {
        method: "POST",
        body: JSON.stringify({ date, notes: notes || undefined, lines }),
      });
      setMsg({ ok: true, text: `${d.voucher_no} posted: ${d.lines} lines${d.batches ? `, ${d.batches} batches created` : ""}.` });
      setQty({}); setMasters([]); setFinals([]); setNotes("");
      setEntering(false);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      loadLists();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not post. Try again." });
    }
  }

  async function remove(no: string) {
    const ok = await confirm({
      title: `Remove ${no}?`,
      body: "All stock and batches from this opening entry are taken back out. This is refused if anything from it was already used.",
      confirm: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/opening-stock?no=${encodeURIComponent(no)}`, { method: "DELETE" });
      setMsg({ ok: true, text: `${no} removed.` });
      loadLists();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not remove. Try again." });
    }
  }

  async function clearDraft() {
    if (!(await confirm({ title: "Clear everything entered?", body: "All quantities and batch rows on every tab are cleared. Posted entries are not touched.", confirm: "Clear", danger: true }))) return;
    setQty({}); setMasters([]); setFinals([]); setNotes("");
  }



  const needle = q.trim().toLowerCase();
  const match = (...t: string[]) => !needle || t.join(" ").toLowerCase().includes(needle);
  const qtyInput = (key: string, step = "1") => (
    <input
      className="erp-input m-0 ml-auto w-[5.5rem] text-right lg:ml-0 lg:w-28"
      type="number"
      min={0}
      step={step}
      value={qty[key] ?? ""}
      placeholder="0"
      onChange={(e) => setOne(key, e.target.value)}
    />
  );
  const haveCell = (n: number) => <td className="text-right tabular-nums text-[#a3a3a3]">{n ? fmt(n) : "–"}</td>;

  const batchEditor = (kind: "master" | "final") => {
    const rows = kind === "master" ? masters : finals;
    const setRows = kind === "master" ? setMasters : setFinals;
    const list = kind === "master" ? masterFormulas : finalFormulas;
    const update = (key: number, patch: Partial<BatchRow>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    return (
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border border-[#e5e5e5]">
          <table className="erp-table erp-stack m-0">
            <thead>
              <tr>
                {kind === "final" && <th>Master batch group</th>}
                <th>{kind === "master" ? "Master batch formula" : "Final batch formula"}</th>
                <th className="text-right lg:w-32">KG per batch</th>
                <th className="text-right lg:w-32">No. of batches</th>
                <th className="text-right lg:w-28">Total KG</th>
                <th>Will be named</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-[#a3a3a3]">No {kind} batches added. Use “Add row”.</td></tr>
              )}
              {rows.map((r) => {
                const f = list.find((x) => x.id === r.formula_id);
                const tag = f ? tagOf(f) : "MN";
                const prefix = kind === "master" ? `MB-${tag}` : `FB-${tag}-${r.master_group || "MB-?"}`;
                const count = Math.max(1, Math.round(num(r.count) || 1));
                return (
                  <tr key={r.key} className="max-lg:px-3">
                    {kind === "final" && (
                      <td className="erp-stack-full" data-label="Master batch group">
                        <Select className="erp-input m-0" value={r.master_group} onChange={(e) => update(r.key, { master_group: e.target.value })}>
                          <option value="">Choose…</option>
                          {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                        </Select>
                      </td>
                    )}
                    <td className="erp-stack-full" data-label={kind === "master" ? "Master batch formula" : "Final batch formula"}>
                      <Select className="erp-input m-0" value={r.formula_id} onChange={(e) => update(r.key, { formula_id: e.target.value === "" ? "" : Number(e.target.value) })}>
                        <option value="">Manual (no formula)</option>
                        {list.map((x) => <option key={x.id} value={x.id}>{x.name || x.code}</option>)}
                      </Select>
                    </td>
                    <td className="text-right" data-label="KG per batch"><input className="erp-input m-0 w-full text-right lg:w-28" type="number" min={0} step="0.001" placeholder="0" value={r.kg} onChange={(e) => update(r.key, { kg: e.target.value })} /></td>
                    <td className="text-right" data-label="No. of batches"><input className="erp-input m-0 w-full text-right lg:w-24" type="number" min={1} step={1} value={r.count} onChange={(e) => update(r.key, { count: e.target.value })} /></td>
                    <td className="text-right tabular-nums" data-label="Total KG">{fmt(num(r.kg) * count)}</td>
                    <td className="whitespace-nowrap text-xs text-[#737373] max-lg:whitespace-normal max-lg:break-all" data-label="Will be named">
                      {prefix}-{stampOf(date)}-0001{count > 1 ? ` … (${count})` : ""}
                    </td>
                    <td><button type="button" className="text-sm font-semibold text-[#a3a3a3] hover:text-rose-700 max-lg:h-11 max-lg:rounded-lg max-lg:border max-lg:border-[#e5e5e5] max-lg:px-4" onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))} aria-label="Remove row"><span className="lg:hidden">Remove row</span><span className="hidden lg:inline">✕</span></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="erp-btn erp-btn-secondary"
          onClick={() => setRows((cur) => [...cur, { key: Date.now(), formula_id: list[0]?.id ?? "", master_group: kind === "final" ? groupOptions[0] ?? "" : "", kg: "", count: "1" }])}
        >
          + Add row
        </button>
        {kind === "final" && missingGroup && <p className="text-sm font-semibold text-rose-700">Choose the master batch group on every final batch row.</p>}
        <p className="erp-hint">
          Count each batch separately when they are labelled on the floor; otherwise enter the total KG of a group as 1 batch.
          Numbers continue from the last one on that date, so the final name may end in a higher number.
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {isAdmin && entering && (
      <Modal title="New opening stock" onClose={() => setEntering(false)} busy={posting} size="xl">
      <div className="space-y-4">
      <div className="erp-panel">
        <p className="erp-hint">
          Enter what was physically on hand before this software was used. Count everything at the cut-off and enter it here with the go-live date.
          Each item lands in the same place a normal entry would put it, so production can carry on from it the next day.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="erp-label">
            Opening date (go-live)
            <DateInput className="erp-input" {...limits} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="erp-label md:col-span-2">
            Remarks
            <input className="erp-input" value={notes} placeholder="Optional, e.g. Physical count on 30-11-2026 night shift" onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="erp-panel">
        <Tabs
          tabs={tabs.map((t) => ({ id: t.id, label: t.label, count: summary[t.id].rows || undefined }))}
          value={tab}
          onChange={(id) => { setTab(id); setQ(""); }}
          className="mb-3"
        />
        <p className="erp-hint">{TAB_HINT[tab]}</p>

        {tab !== "master" && tab !== "final" && tab !== "fg" && (
          <input className="erp-input mb-3 max-w-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        )}

        {!dataReady && tab !== "master" && tab !== "final" ? (
          <SkeletonTable rows={8} cols={3} />
        ) : (
          <>
        {tab === "raw" && (
          <div className="overflow-x-auto rounded-lg border border-[#e5e5e5]">
            <table className="erp-table m-0">
              <thead><tr><th className="hidden lg:table-cell lg:w-28">Code</th><th>Raw material</th><th className="text-right lg:w-36"><span className="lg:hidden">In system</span><span className="hidden lg:inline">In system now</span></th><th className="text-right lg:w-36">Opening KG</th></tr></thead>
              <tbody>
                {materials.filter((m) => match(m.code, m.name)).map((m) => (
                  <tr key={m.id}>
                    <td className="hidden text-[#737373] lg:table-cell">{m.code}</td>
                    <td className="font-medium">{m.name}<span className="block text-xs font-normal text-[#a3a3a3] lg:hidden">{m.code}</span></td>
                    {haveCell(haveRaw(m.id))}
                    <td className="text-right">{qtyInput(`RAW|${m.id}`, "0.001")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "store" && (
          <div className="overflow-x-auto rounded-lg border border-[#e5e5e5]">
            <table className="erp-table m-0">
              <thead><tr><th>Item</th><th className="hidden lg:table-cell lg:w-40">Type</th><th className="hidden lg:table-cell lg:w-20">Unit</th><th className="text-right lg:w-36"><span className="lg:hidden">In system</span><span className="hidden lg:inline">In system now</span></th><th className="text-right lg:w-36">Opening qty</th></tr></thead>
              <tbody>
                {storeItems.filter((i) => match(i.name, i.group)).map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">
                      {i.name}
                      <span className="block text-xs font-normal text-[#a3a3a3] lg:hidden">{i.group === "Pouch Item" ? "Pouch Material" : "Store Item"} · {i.unit}</span>
                    </td>
                    <td className="hidden text-[#737373] lg:table-cell">{i.group === "Pouch Item" ? "Pouch Material" : "Store Item"}</td>
                    <td className="hidden text-[#737373] lg:table-cell">{i.unit}</td>
                    {haveCell(haveStore(i.id))}
                    <td className="text-right">{qtyInput(`STORE|${i.id}`, "0.001")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "green" && (
          <div className="overflow-x-auto rounded-lg border border-[#e5e5e5]">
            <table className="erp-table m-0">
              <thead><tr><th>Size</th><th className="text-right lg:w-36"><span className="lg:hidden">In system</span><span className="hidden lg:inline">In system now</span></th><th className="text-right lg:w-36">Opening PCS</th></tr></thead>
              <tbody>
                {sizes.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-[#a3a3a3]">No sizes in Item Master (Finished Goods).</td></tr>}
                {sizes.filter((s) => match(s)).map((s) => (
                  <tr key={s}>
                    <td className="font-medium">{s}</td>
                    {haveCell(haveTube("EXTRUSION", s, ""))}
                    <td className="text-right">{qtyInput(`PRODUCT|EXTRUSION|${s}|`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(tab === "cured" || tab === "qc") && (
          <div className="overflow-x-auto rounded-lg border border-[#e5e5e5]">
            <table className="erp-table m-0">
              <thead><tr><th><span className="lg:hidden">Size / valve</span><span className="hidden lg:inline">Size</span></th><th className="hidden lg:table-cell">Valve</th><th className="text-right lg:w-36"><span className="lg:hidden">In system</span><span className="hidden lg:inline">In system now</span></th><th className="text-right lg:w-36">Opening PCS</th></tr></thead>
              <tbody>
                {pairs.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-[#a3a3a3]">No size / valve in the Product List.</td></tr>}
                {pairs.filter((p) => match(p.size, p.valve)).map((p) => (
                  <tr key={`${p.size}|${p.valve}`}>
                    <td className="font-medium">{p.size}<span className="block text-xs font-normal text-[#737373] lg:hidden">{p.valve}</span></td>
                    <td className="hidden lg:table-cell">{p.valve}</td>
                    {haveCell(haveTube(TUBE_TABS[tab].dept, p.size, p.valve))}
                    <td className="text-right">{qtyInput(`PRODUCT|${TUBE_TABS[tab].dept}|${p.size}|${p.valve}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "fg" && (() => {
          const prefix = "PRODUCT|FG|";
          const pairSizes = [...new Set(pairs.map((p) => p.size))];
          const valvesOf = (sz: string) => pairs.filter((p) => p.size === sz).map((p) => p.valve);
          const added = Object.entries(qty)
            .filter(([k, v]) => k.startsWith(prefix) && num(v) > 0)
            .map(([k, v]) => { const [size, valve, brand] = k.slice(prefix.length).split("|"); return { key: k, size, valve: valve ?? "", brand: brand ?? "", n: num(v) }; });
          const pickedQty = Math.round(num(pickQty));
          const canAdd = !!pickSize && !!pickValve && !!pickBrand && pickedQty > 0;
          const add = () => {
            if (!canAdd) return;
            setOne(`${prefix}${pickSize}|${pickValve}|${pickBrand}`, String(pickedQty));
            setPickQty("");
          };
          return (
            <div className="space-y-3">
              <div className="grid gap-3 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_8rem_auto] lg:items-end">
                <label className="block text-xs font-medium text-[#525252]">Size
                  <Select className="erp-input mt-1 w-full" value={pickSize} onChange={(e) => { const sz = e.target.value; setPickSize(sz); const v = valvesOf(sz); setPickValve(v.length === 1 ? v[0] : ""); }}>
                    <option value="">Select size</option>
                    {pairSizes.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
                  </Select>
                </label>
                <label className="block text-xs font-medium text-[#525252]">Valve
                  <Select className="erp-input mt-1 w-full" value={pickValve} disabled={!pickSize} onChange={(e) => setPickValve(e.target.value)}>
                    <option value="">{pickSize ? "Select valve" : "Select size first"}</option>
                    {valvesOf(pickSize).map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </label>
                <label className="block text-xs font-medium text-[#525252]">Brand
                  <Select className="erp-input mt-1 w-full" value={pickBrand} onChange={(e) => setPickBrand(e.target.value)}>
                    <option value="">Select brand</option>
                    {brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </Select>
                </label>
                <label className="block text-xs font-medium text-[#525252]">Opening PCS
                  <input className="erp-input mt-1 w-full text-right" type="number" inputMode="numeric" min="0" step="1" placeholder="0" value={pickQty} onChange={(e) => setPickQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
                </label>
                <button type="button" className="erp-btn" disabled={!canAdd} onClick={add}>Add</button>
              </div>
              {pickSize && pickValve && (
                <p className="text-xs text-[#737373]">In system now for {pickSize} / {pickValve}{pickBrand ? ` / ${pickBrand}` : ""}: {fmt(haveTube("FG", pickSize, pickValve, pickBrand || undefined))} PCS</p>
              )}
              <div className="overflow-x-auto rounded-lg border border-[#e5e5e5]">
                <table className="erp-table m-0">
                  <thead><tr><th><span className="lg:hidden">Size / valve</span><span className="hidden lg:inline">Size</span></th><th className="hidden lg:table-cell">Valve</th><th>Brand</th><th className="text-right lg:w-36"><span className="lg:hidden">In system</span><span className="hidden lg:inline">In system now</span></th><th className="text-right lg:w-36">Opening PCS</th><th className="w-20" /></tr></thead>
                  <tbody>
                    {added.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#a3a3a3]">Nothing added yet. Select a size, valve and brand, enter the PCS, then press Add.</td></tr>}
                    {added.map((r) => (
                      <tr key={r.key}>
                        <td className="font-medium">{r.size}<span className="block text-xs font-normal text-[#737373] lg:hidden">{r.valve}</span></td>
                        <td className="hidden lg:table-cell">{r.valve}</td>
                        <td>{r.brand}</td>
                        {haveCell(haveTube("FG", r.size, r.valve, r.brand))}
                        <td className="text-right">{qtyInput(r.key)}</td>
                        <td className="text-right"><IconAction kind="delete" label="Remove" onClick={() => setOne(r.key, "")} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {tab === "reject" && (
          <div className="overflow-x-auto rounded-lg border border-[#e5e5e5]">
            <table className="erp-table erp-stack m-0">
              <thead><tr><th>Size</th><th>Valve</th><th className="text-right lg:w-32">Repair PCS</th><th className="text-right lg:w-32">Second PCS</th><th className="text-right lg:w-32">Scrap PCS</th></tr></thead>
              <tbody>
                {pairs.filter((p) => match(p.size, p.valve)).map((p) => (
                  <tr key={`${p.size}|${p.valve}`} className="max-lg:px-3 max-lg:[grid-template-columns:repeat(3,minmax(0,1fr))]!">
                    <td className="erp-stack-full font-medium">{p.size}<span className="font-normal text-[#737373] lg:hidden"> / {p.valve}</span></td>
                    <td className="hidden lg:table-cell">{p.valve}</td>
                    <td className="text-right [&_input]:max-lg:w-full" data-label="Repair">{qtyInput(`REJECT|${p.size}|${p.valve}|repair`)}</td>
                    <td className="text-right [&_input]:max-lg:w-full" data-label="Second">{qtyInput(`REJECT|${p.size}|${p.valve}|second`)}</td>
                    <td className="text-right [&_input]:max-lg:w-full" data-label="Scrap">{qtyInput(`REJECT|${p.size}|${p.valve}|scrap`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "master" && batchEditor("master")}
        {tab === "final" && batchEditor("final")}
          </>
        )}
      </div>

      {/* Phones: a long list hides the Post button, so a floating button jumps to it. */}
      {filled.length > 0 && (
        <button
          type="button"
          className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-30 h-12 -translate-x-1/2 rounded-full bg-[#171717] px-5 text-[15px] font-semibold text-white shadow-lg lg:hidden"
          onClick={() => document.getElementById("opening-review")?.scrollIntoView({ behavior: "smooth", block: "center" })}
        >
          Review &amp; post · {filled.reduce((n, t) => n + summary[t.id].rows, 0)} rows
        </button>
      )}

      <div className="erp-panel" id="opening-review">
        <div className="text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">Will post</div>
        {filled.length === 0 ? (
          <p className="mt-1 text-sm text-[#a3a3a3]">Nothing entered yet. Fill in the tabs above; your entries are kept in this browser until you post.</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filled.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-left hover:bg-[#f5f5f5]">
                <div className="text-xs font-semibold text-[#171717]">{t.label}</div>
                <div className="text-xs text-[#737373]">
                  {summary[t.id].rows} {t.id === "master" || t.id === "final" ? "batches" : "rows"} · <b className="text-[#171717]">{fmt(summary[t.id].total)} {summary[t.id].unit}</b>
                </div>
              </button>
            ))}
          </div>
        )}
        {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="erp-btn" onClick={postOnce} disabled={posting || lines.length === 0 || missingGroup}>
            {posting ? <Busy>Posting…</Busy> : `Post opening stock (${showDate(date)})`}
          </button>
          {filled.length > 0 && <button type="button" className="erp-btn erp-btn-secondary" onClick={clearDraft}>Clear all</button>}
        </div>
      </div>

      </div>
      </Modal>
      )}

      <div className="erp-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-base font-semibold">Posted opening entries</h3>
          {isAdmin && <AddButton label="New opening stock" onClick={() => setEntering(true)} />}
        </div>
        <p className="erp-hint">Open an entry to see every line.{canDelete ? " Remove takes it back out, as long as nothing from it has been used yet." : ""}</p>
        {openings.length === 0 && <p className="text-sm text-[#a3a3a3]">No opening stock posted yet.</p>}
        <div className="space-y-2">
          {openings.map((o) => {
            const isOpen = open === o.voucher_no;
            const voided = o.status === "VOID";
            const groups = [...new Set(o.lines.map((l) => l.category))];
            return (
              <div key={o.voucher_no} className={`rounded-lg border border-[#e5e5e5] ${voided ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <button type="button" className="flex flex-wrap items-baseline gap-x-3 text-left" onClick={() => setOpen(isOpen ? null : o.voucher_no)}>
                    <ExpandIcon open={isOpen} size="sm" />
                    <span className={`font-semibold ${voided ? "line-through" : ""}`}>{o.voucher_no}</span>
                    <span className="text-sm text-[#737373]">{showDate(o.date)} · {o.lines.length} lines{o.by ? ` · by ${o.by}` : ""}</span>
                    {voided && <span className="text-xs font-semibold text-rose-700">Removed</span>}
                  </button>
                  {!voided && canDelete && dateOk(o.date) && <IconAction kind="delete" label="Remove" onClick={() => remove(o.voucher_no)} />}
                </div>
                {isOpen && (
                  <div className="border-t border-[#e5e5e5] px-3 py-2">
                    {o.notes && <p className="mb-2 text-xs text-[#737373]">{o.notes}</p>}
                    <div className="overflow-x-auto">
                      <table className="erp-table m-0">
                        <thead><tr><th>Where</th><th>Item</th><th className="text-right">Qty</th><th className="lg:w-16">Unit</th></tr></thead>
                        <tbody>
                          {groups.flatMap((g) => o.lines.filter((l) => l.category === g).map((l, i) => (
                            <tr key={`${g}-${i}`}>
                              <td className="text-[#737373]">{i === 0 ? g : ""}</td>
                              <td>{l.item}</td>
                              <td className="text-right tabular-nums">{fmt(l.qty)}</td>
                              <td className="text-[#737373]">{l.unit}</td>
                            </tr>
                          )))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
