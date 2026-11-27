"use client";

import { Busy } from "@/components/spinner";
import { Tabs } from "@/components/tabs";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";
import { isPackingPouch } from "@/lib/erp/units";
import { ALL_SIZES, bagFamily, findFixedItem, isPerSizeItem, needsBrand } from "@/lib/erp/codes";

type Grade = { id: number; name: string };
type Item = { id: number; name: string; unit: string; group: string };
type Row = {
  id: number;
  quality_grade_id: number | null;
  size: string;
  item_id: number;
  cons_qty: number;
  export_qty: number;
};
/** One rule on screen: these sizes, these brands, a domestic qty and an export qty per finished piece. */
type Rule = { key: string; sizes: string[]; brands: number[]; qty: string; exportQty: string };

let ruleSeq = 0;
const newRule = (patch: Partial<Rule> = {}): Rule => ({ key: `r${++ruleSeq}`, sizes: [], brands: [], qty: "1", exportQty: "1", ...patch });
const qtyText = (v: number) => String(Number(v.toFixed(4)));

/** Turns the stored rows of one item back into rules: sizes with the same brands and qty share a rule. */
function rulesFromRows(rows: Row[]): Rule[] {
  const bySize = new Map<string, { qty: number; exportQty: number; brands: number[] }>();
  for (const r of rows) {
    const cur = bySize.get(r.size) ?? { qty: r.cons_qty, exportQty: r.export_qty ?? 0, brands: [] };
    if (r.quality_grade_id != null) cur.brands.push(r.quality_grade_id);
    bySize.set(r.size, cur);
  }
  const groups = new Map<string, Rule>();
  for (const [size, v] of [...bySize.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const brands = [...new Set(v.brands)].sort((a, b) => a - b);
    const key = `${v.qty}|${v.exportQty}|${brands.join(",")}`;
    const g = groups.get(key) ?? newRule({ qty: qtyText(v.qty), exportQty: qtyText(v.exportQty), brands });
    g.sizes.push(size);
    groups.set(key, g);
  }
  return [...groups.values()];
}

function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  noun,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  noun: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    // Scrolling inside the list itself must not close it; only the page scrolling should.
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Freeze the page behind the open list: block wheel/touch scrolling anywhere outside it.
    const block = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) e.preventDefault();
    };
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    const bar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (bar > 0) body.style.paddingRight = `${bar}px`;
    document.addEventListener("wheel", block, { passive: false });
    document.addEventListener("touchmove", block, { passive: false });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("wheel", block);
      document.removeEventListener("touchmove", block);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggleOpen() {
    if (disabled) return;
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      setPos({ left: r.left, width: Math.max(r.width, 260), top: below > 300 ? r.bottom + 4 : Math.max(8, r.top - 300) });
      setQ("");
    }
    setOpen(!open);
  }

  const names = options.filter((o) => value.includes(o.value)).map((o) => o.label);
  const summary = value.length === 0 ? placeholder : names.length <= 2 ? names.join(", ") : `${names.length} ${noun} selected`;
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="erp-input mt-0 flex min-w-[170px] items-center justify-between gap-2 text-left disabled:bg-[#f5f5f5]"
      >
        <span className={`truncate ${value.length === 0 ? "text-[#a3a3a3]" : ""}`}>{summary}</span>
        <span aria-hidden className="text-xs text-[#737373]">▾</span>
      </button>
      {open && pos && (
        <div ref={pop} style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width }} className="z-50 rounded-xl border border-[#e5e5e5] bg-white p-2 shadow-xl">
          {options.length > 8 && (
            <input autoFocus className="erp-input mb-2 mt-0" placeholder={`Search ${noun}`} value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="mb-1 flex gap-3 px-1 text-xs font-semibold text-[#171717]">
            <button type="button" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.value)])])}>Select all</button>
            <button type="button" onClick={() => onChange(value.filter((v) => !shown.some((o) => o.value === v)))}>Clear</button>
            <span className="ml-auto font-normal text-[#737373]">{value.length} selected</span>
          </div>
          <div className="max-h-64 overflow-y-auto overscroll-contain" role="listbox" aria-multiselectable>
            {shown.length === 0 && <div className="px-2 py-2 text-sm text-[#737373]">Nothing found.</div>}
            {[
              { title: "Selected", list: shown.filter((o) => value.includes(o.value)), on: true },
              { title: "Other options", list: shown.filter((o) => !value.includes(o.value)), on: false },
            ].map(
              (sec) =>
                sec.list.length > 0 && (
                  <div key={sec.title} className="mb-1">
                    <div className="sticky top-0 bg-white px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-[#737373]">
                      {sec.title} <span className="font-semibold">({sec.list.length})</span>
                    </div>
                    <ul>
                      {sec.list.map((o) => (
                        <li key={o.value}>
                          <label className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[#fafafa] ${sec.on ? "bg-[#f5f5f5] font-semibold text-[#171717]" : ""}`}>
                            <input type="checkbox" checked={sec.on} onChange={() => onChange(sec.on ? value.filter((v) => v !== o.value) : [...value, o.value])} />
                            {o.label}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function PackingClient({ isAdmin, canDelete = isAdmin }: { isAdmin: boolean; admin?: boolean; canDelete?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Rule[]>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [types, setTypes] = useState<{ id: number; name: string }[]>([]);
  const [catalog, setCatalog] = useState<{ size: string; category: string }[]>([]);
  const [outerType, setOuterType] = useState("all");
  const [tab, setTab] = useState<"products" | "outer">("products");
  const [busy, setBusy] = useState<number | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  /** Shared bag qty per size for each family (e.g. "25 Bags"), edited on the Bags tab. */
  const [famDraft, setFamDraft] = useState<Record<string, Record<string, { qty: string; exportQty: string }>>>({});
  const [famDirty, setFamDirty] = useState<Set<string>>(new Set());
  const [famNote, setFamNote] = useState<Record<string, { ok: boolean; text: string }>>({});
  const famDirtyRef = useRef(famDirty);
  famDirtyRef.current = famDirty;

  const load = useCallback(async (resetItem?: number) => {
    const [packings, gradeRows, inventory, products, typeRows, catalogRows] = await Promise.all([
      api<Row[]>("/api/masters/packing"),
      api<Grade[]>("/api/masters/qualities"),
      api<Item[]>("/api/masters/inventory"),
      api<{ size: string }[]>("/api/products"),
      api<{ id: number; name: string }[]>("/api/product-types").catch(() => []),
      api<{ size: string; category: string }[]>("/api/catalog").catch(() => []),
    ]);
    setTypes(Array.isArray(typeRows) ? typeRows : []);
    setCatalog(Array.isArray(catalogRows) ? catalogRows : []);
    const list = (Array.isArray(packings) ? packings : []).filter((r) => r.size !== ALL_SIZES);
    const inventoryRows = Array.isArray(inventory) ? inventory : [];
    // Pouch Materials, plus the fixed items that are deducted for every size.
    const shown = inventoryRows.filter(
      (row) => (row.group === "Pouch Item" || row.group === "Store Item") && (needsBrand(row, isPackingPouch) || findFixedItem(row.name)),
    );
    const names = new Set<string>([
      ...(Array.isArray(products) ? products : []).map((row) => row.size),
      ...inventoryRows.filter((row) => row.group === "Finished Goods").map((row) => row.name),
      ...list.map((row) => row.size),
    ]);
    setRows(list);
    setGrades(Array.isArray(gradeRows) ? gradeRows : []);
    setItems(shown);
    setSizes([...names].filter(Boolean).sort());
    setDrafts((prev) => {
      const next: Record<number, Rule[]> = {};
      for (const item of shown) {
        const keep = prev[item.id] && dirtyRef.current.has(item.id) && item.id !== resetItem;
        if (keep) next[item.id] = prev[item.id];
        else {
          const mine = list.filter((r) => r.item_id === item.id);
          if (isPerSizeItem(item.name)) {
            // Outer Bags-100: one line per size, each with its own qty.
            next[item.id] = mine
              .filter((r) => r.size !== ALL_SIZES)
              .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }))
              .map((r) => newRule({ sizes: [r.size], qty: qtyText(r.cons_qty), exportQty: qtyText(r.export_qty ?? 0) }));
          } else if (bagFamily(item.name)) {
            // Shared bags: only the brands are set here; sizes and qty come from the Bags tab.
            const brands = [...new Set(mine.map((r) => r.quality_grade_id).filter((x): x is number => x != null))].sort((a, b) => a - b);
            next[item.id] = [newRule({ brands, qty: "0", exportQty: "0" })];
          } else {
            const rules = rulesFromRows(mine);
            // Auto items use one qty for every size, so they show as a single rule.
            next[item.id] = rules.length ? (findFixedItem(item.name) ? [rules[0]] : rules) : [newRule()];
          }
        }
      }
      return next;
    });
    // One qty per size for each bag family. If its bags disagree, the most common value is shown.
    const fams = new Map<string, Item[]>();
    for (const item of shown) {
      const f = bagFamily(item.name);
      if (f) fams.set(f, [...(fams.get(f) ?? []), item]);
    }
    const computed: Record<string, Record<string, { qty: string; exportQty: string }>> = {};
    const notesOut: Record<string, { ok: boolean; text: string }> = {};
    const mixedFams: string[] = [];
    for (const [fam, members] of fams) {
      const ids = new Set(members.map((m) => m.id));
      const bySize = new Map<string, string[]>();
      for (const r of list) {
        if (!ids.has(r.item_id)) continue;
        bySize.set(r.size, [...(bySize.get(r.size) ?? []), `${qtyText(r.cons_qty)}|${qtyText(r.export_qty ?? 0)}`]);
      }
      const map: Record<string, { qty: string; exportQty: string }> = {};
      let mixed = 0;
      for (const [size, vals] of bySize) {
        const count = new Map<string, number>();
        for (const v of vals) count.set(v, (count.get(v) ?? 0) + 1);
        const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
        if (count.size > 1) mixed += 1;
        const [qty, exportQty] = best.split("|");
        map[size] = { qty, exportQty };
      }
      computed[fam] = map;
      if (mixed) {
        mixedFams.push(fam);
        notesOut[fam] = { ok: false, text: `${mixed} size${mixed === 1 ? " had" : "s had"} different qty on different bags. Showing the most common one; check it and Save to use it for all.` };
      }
    }
    const keep = famDirtyRef.current;
    setFamDraft((prev) => {
      const next: typeof prev = {};
      for (const fam of Object.keys(computed)) next[fam] = prev[fam] && keep.has(fam) ? prev[fam] : computed[fam];
      return next;
    });
    setFamNote((prev) => {
      const next: typeof prev = {};
      for (const fam of Object.keys(computed)) {
        if (notesOut[fam]) next[fam] = notesOut[fam];
        else if (prev[fam]?.ok) next[fam] = prev[fam];
      }
      return next;
    });
    // Bags that disagree need one Save to line them up, so mark them unsaved.
    if (mixedFams.length) setFamDirty((s) => new Set([...s, ...mixedFams]));
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const ordered = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          Number(!!findFixedItem(a.name)) - Number(!!findFixedItem(b.name)) || a.name.localeCompare(b.name, undefined, { numeric: true }),
      ),
    [items],
  );
  /** Which product types each size belongs to, from the product list. */
  const sizeTypes = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of catalog) {
      if (!map.has(c.size)) map.set(c.size, new Set());
      map.get(c.size)!.add(c.category);
    }
    return map;
  }, [catalog]);
  const typeCount = (name: string) => sizes.filter((sz) => sizeTypes.get(sz)?.has(name)).length;
  const outerSizes = useMemo(
    () => (outerType === "all" ? sizes : sizes.filter((sz) => sizeTypes.get(sz)?.has(outerType))),
    [sizes, sizeTypes, outerType],
  );
  const mainDirty = ordered.filter((it) => !isPerSizeItem(it.name) && dirty.has(it.id)).length;
  /** Bag families and their bags, e.g. "25 Bags" → CZ / VZ / PLAIN 25 BAGS. */
  const families = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const f = bagFamily(it.name);
      if (f) map.set(f, [...(map.get(f) ?? []), it]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([name, members]) => ({ name, members: members.sort((x, y) => x.name.localeCompare(y.name)) }));
  }, [items]);
  const bagsDirty = famDirty.size > 0;
  /** Bags tab columns: each outer bag on its own, then one shared column per bag family. */
  const bagCols = useMemo(
    () => [
      ...items
        .filter((it) => isPerSizeItem(it.name))
        .sort((x, y) => y.name.localeCompare(x.name, undefined, { numeric: true }))
        .map((o) => ({
          key: `item-${o.id}`,
          title: o.name,
          sub: "",
          shared: false,
          get: (size: string) => (drafts[o.id] ?? []).find((x) => x.sizes[0] === size),
          set: (size: string, patch: Partial<Rule>) => setOuterQty(o.id, size, patch),
        })),
      ...families.map((f) => ({
        key: `fam-${f.name}`,
        title: f.name,
        sub: f.members.map((m) => m.name.replace(/\s*\d+\s*BAGS?\s*$/i, "")).join(" · "),
        shared: true,
        get: (size: string) => famDraft[f.name]?.[size],
        set: (size: string, patch: Partial<{ qty: string; exportQty: string }>) => setFamQty(f.name, size, patch),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, families, drafts, famDraft],
  );
  const outers = useMemo(
    () => items.filter((it) => isPerSizeItem(it.name)).sort((x, y) => y.name.localeCompare(x.name, undefined, { numeric: true })),
    [items],
  );
  const sizeOptions = useMemo(() => sizes.map((s) => ({ value: s, label: s })), [sizes]);
  const brandOptions = useMemo(() => grades.map((g) => ({ value: String(g.id), label: g.name })), [grades]);

  /** Outer Bags: sets one size's domestic or export qty, creating that size's line when needed. */
  function setOuterQty(itemId: number, size: string, patch: Partial<Rule>) {
    setDrafts((d) => {
      const cur = d[itemId] ?? [];
      const has = cur.some((x) => x.sizes[0] === size);
      const next = has
        ? cur.map((x) => (x.sizes[0] === size ? { ...x, ...patch } : x))
        : [...cur, newRule({ sizes: [size], qty: "0", exportQty: "0", ...patch })];
      return { ...d, [itemId]: next };
    });
    setDirty((s) => new Set(s).add(itemId));
    setNotes((n) => {
      const rest = { ...n };
      delete rest[itemId];
      return rest;
    });
  }

  function setFamQty(fam: string, size: string, patch: Partial<{ qty: string; exportQty: string }>) {
    setFamDraft((d) => {
      const cur = d[fam] ?? {};
      const base = cur[size] ?? { qty: "0", exportQty: "0" };
      return { ...d, [fam]: { ...cur, [size]: { ...base, ...patch } } };
    });
    setFamDirty((s) => new Set(s).add(fam));
    setFamNote((n) => {
      const rest = { ...n };
      delete rest[fam];
      return rest;
    });
  }

  /** Bags tab Save: the outer bags that changed, and every bag of each changed family. */
  async function saveOuter() {
    for (const it of outers) if (dirty.has(it.id)) await save(it);
    for (const fam of families) {
      if (!famDirty.has(fam.name)) continue;
      const missing = fam.members.filter((m) => (drafts[m.id]?.[0]?.brands.length ?? 0) === 0);
      let ok = true;
      for (const m of fam.members) {
        if (missing.includes(m)) continue;
        if (!(await save(m))) ok = false;
      }
      setFamDirty((s) => {
        const next = new Set(s);
        if (ok) next.delete(fam.name);
        return next;
      });
      famDirtyRef.current = new Set([...famDirtyRef.current].filter((f) => f !== fam.name || !ok));
      setFamNote((n) => ({
        ...n,
        [fam.name]: !ok
          ? { ok: false, text: "Some bags could not be saved. Check the Products tab." }
          : missing.length
            ? { ok: false, text: `Saved. ${missing.map((m) => m.name).join(", ")} ${missing.length === 1 ? "has" : "have"} no brand yet, so ${missing.length === 1 ? "it is" : "they are"} not used. Choose the brand on the Products tab.` }
            : { ok: true, text: "Saved" },
      }));
    }
  }

  /** Rules for a shared bag: the family's sizes and qty, with this bag's brands. */
  function familyRules(item: Item) {
    const fam = bagFamily(item.name)!;
    const brands = drafts[item.id]?.[0]?.brands ?? [];
    const groups = new Map<string, { brand_ids: number[]; sizes: string[]; cons_qty: number; export_qty: number }>();
    for (const [size, v] of Object.entries(famDraft[fam] ?? {})) {
      const qty = Number(v.qty) || 0;
      const exportQty = Number(v.exportQty) || 0;
      if (qty <= 0 && exportQty <= 0) continue;
      const key = `${qty}|${exportQty}`;
      const g = groups.get(key) ?? { brand_ids: brands, sizes: [], cons_qty: qty, export_qty: exportQty };
      g.sizes.push(size);
      groups.set(key, g);
    }
    return [...groups.values()];
  }

  function change(itemId: number, ruleKey: string, patch: Partial<Rule>) {
    setDrafts((d) => ({ ...d, [itemId]: (d[itemId] ?? []).map((r) => (r.key === ruleKey ? { ...r, ...patch } : r)) }));
    setDirty((s) => new Set(s).add(itemId));
    setNotes((n) => {
      const rest = { ...n };
      delete rest[itemId];
      return rest;
    });
  }

  function removeRule(itemId: number, ruleKey: string) {
    setDrafts((d) => {
      const left = (d[itemId] ?? []).filter((r) => r.key !== ruleKey);
      return { ...d, [itemId]: left.length ? left : [newRule()] };
    });
    setDirty((s) => new Set(s).add(itemId));
  }

  function problem(item: Item, rules: Rule[]) {
    if (bagFamily(item.name)) {
      const fam = bagFamily(item.name)!;
      const used = Object.values(famDraft[fam] ?? {}).some((v) => Number(v.qty) > 0 || Number(v.exportQty) > 0);
      if (used && (rules[0]?.brands.length ?? 0) === 0) return "Choose at least one brand.";
      return "";
    }
    const branded = needsBrand(item, isPackingPouch);
    const seen = new Set<string>();
    for (const r of rules) {
      if (r.sizes.length === 0) continue;
      if (r.qty.trim() === "" || !(Number(r.qty) >= 0)) return "Enter the domestic qty. Use 0 to deduct nothing.";
      if (r.exportQty.trim() === "" || !(Number(r.exportQty) >= 0)) return "Enter the export qty. Use 0 to deduct nothing.";
      if (branded && r.brands.length === 0) return "Choose at least one brand for the selected sizes.";
      for (const size of r.sizes) for (const b of branded ? r.brands : [0]) {
        const k = `${size}|${b}`;
        if (seen.has(k)) return `${size} is in two rules. Keep it in one rule.`;
        seen.add(k);
      }
    }
    return "";
  }

  /** One Save for the whole products table: saves every product that was changed. */
  async function saveAll() {
    const targets = ordered.filter((it) => !isPerSizeItem(it.name) && dirty.has(it.id));
    for (const it of targets) await save(it);
  }

  async function save(item: Item): Promise<boolean> {
    const rules = drafts[item.id] ?? [];
    const fixed = !!findFixedItem(item.name) && !isPerSizeItem(item.name);
    const issue = problem(item, rules);
    if (issue) {
      setNotes((n) => ({ ...n, [item.id]: { ok: false, text: issue } }));
      return false;
    }
    setBusy(item.id);
    try {
      await api("/api/masters/packing", {
        method: "PUT",
        body: JSON.stringify({
          item_id: item.id,
          rules: bagFamily(item.name)
            ? familyRules(item)
            : rules
                .filter((r) => (fixed || r.sizes.length > 0) && (!isPerSizeItem(item.name) || Number(r.qty) > 0 || Number(r.exportQty) > 0))
                .map((r) => ({ brand_ids: r.brands, sizes: fixed ? sizes : r.sizes, cons_qty: Number(r.qty), export_qty: Number(r.exportQty) })),
        }),
      });
      setDirty((s) => {
        const next = new Set(s);
        next.delete(item.id);
        return next;
      });
      dirtyRef.current = new Set([...dirtyRef.current].filter((id) => id !== item.id));
      setNotes((n) => ({ ...n, [item.id]: { ok: true, text: "Saved" } }));
      await load(item.id);
      return true;
    } catch (e) {
      setNotes((n) => ({ ...n, [item.id]: { ok: false, text: e instanceof ApiClientError ? e.message : "Could not save" } }));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs
        size="sm"
        tabs={[
          { id: "products", label: "Products", dot: mainDirty > 0 },
          { id: "outer", label: "Bags", dot: outers.some((o) => dirty.has(o.id)) || bagsDirty },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "products" && (
      <div className="erp-panel">
        <h3 className="mb-1 text-base font-semibold">Products</h3>
        <p className="erp-hint">Qty used per finished piece. 0 deducts nothing. Pouches are deducted by the brand chosen at packing; Nut/Washer/Cap and Valve Pin apply to every size.</p>
        <table className="erp-table erp-stack m-0">
          <thead>
            <tr>
              <th className="w-[24%]">Product</th>
              <th className="w-[20%]">Brand</th>
              <th>Sizes</th>
              <th className="w-28">Domestic Qty</th>
              <th className="w-28">Export Qty</th>
              <th className="w-44" />
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-[#737373]">No Pouch Material items yet. Add items to the Pouch Item group in Item Master.</td>
              </tr>
            )}
            {ordered.filter((it) => !isPerSizeItem(it.name)).map((item) => {
              const rules = drafts[item.id] ?? [];
              const fixed = !!findFixedItem(item.name) && !isPerSizeItem(item.name);
              const branded = needsBrand(item, isPackingPouch);
              const note = notes[item.id];
              const fam = bagFamily(item.name);
              const famSizes = fam ? Object.values(famDraft[fam] ?? {}).filter((v) => Number(v.qty) > 0 || Number(v.exportQty) > 0).length : 0;
              return rules.map((rule, i) => (
                <tr key={`${item.id}-${rule.key}`} className={`align-top ${i === 0 ? "border-t-2 border-t-[#e5e5e5]" : ""}`}>
                  <td className="erp-stack-full font-semibold">
                    {i === 0 ? (
                      <>
                        {item.name}
                        {fixed && <span className="ml-2 rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[11px] font-semibold text-[#737373]">Auto</span>}
                        <span className="mt-0.5 block text-xs font-normal text-[#737373]">{item.group === "Pouch Item" ? "Pouch Material" : "Store Material"} · {item.unit}</span>
                      </>
                    ) : (
                      <span className="text-xs font-normal text-[#a3a3a3]">{item.name} (another rule)</span>
                    )}
                  </td>
                  <td className="erp-stack-full" data-label="Brand">
                    {branded ? (
                      <MultiSelect
                        options={brandOptions}
                        value={rule.brands.map(String)}
                        onChange={(v) => change(item.id, rule.key, { brands: v.map(Number) })}
                        placeholder="Select brands"
                        noun="brands"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <span className="text-[#a3a3a3]">All brands</span>
                    )}
                  </td>
                  <td className="erp-stack-full" data-label="Sizes">
                    {fam ? (
                      <button type="button" className="text-left text-sm text-[#737373] underline-offset-2 hover:underline" onClick={() => setTab("outer")}>
                        {famSizes} size{famSizes === 1 ? "" : "s"} · set on the Bags tab ({fam})
                      </button>
                    ) : fixed ? (
                      <span className="text-sm text-[#737373]">All sizes ({sizes.length})</span>
                    ) : (
                      <MultiSelect
                        options={sizeOptions}
                        value={rule.sizes}
                        onChange={(v) => change(item.id, rule.key, { sizes: v })}
                        placeholder="Select sizes"
                        noun="sizes"
                        disabled={!isAdmin}
                      />
                    )}
                  </td>
                  <td data-label="Domestic Qty">
                    {fam ? <span className="text-xs text-[#a3a3a3]">Bags tab</span> : <input
                      className="erp-input mt-0"
                      type="number"
                      min={0}
                      step="0.0001"
                      value={rule.qty}
                      disabled={!isAdmin}
                      onChange={(e) => change(item.id, rule.key, { qty: e.target.value })}
                    />}
                  </td>
                  <td data-label="Export Qty">
                    {fam ? <span className="text-xs text-[#a3a3a3]">Bags tab</span> : <input
                      className="erp-input mt-0"
                      type="number"
                      min={0}
                      step="0.0001"
                      value={rule.exportQty}
                      disabled={!isAdmin}
                      onChange={(e) => change(item.id, rule.key, { exportQty: e.target.value })}
                    />}
                  </td>
                  <td className="erp-stack-full">
                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-2">
                        {canDelete && !fixed && rules.length > 1 && (
                          <button type="button" aria-label="Remove rule" title="Remove rule" onClick={() => removeRule(item.id, rule.key)} className="grid h-9 w-9 place-items-center rounded-lg bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2]">×</button>
                        )}
                        {i === rules.length - 1 && note && <span className={`basis-full text-xs font-semibold ${note.ok ? "text-emerald-700" : "text-red-700"}`}>{note.text}</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
        {isAdmin && (
          <div className="erp-sticky-bar mt-3 flex flex-wrap items-center justify-end gap-3">
            {mainDirty > 0 && <span className="text-xs text-[#737373]">{mainDirty} product{mainDirty > 1 ? "s" : ""} with unsaved changes</span>}
            <button type="button" className="erp-btn mt-0" disabled={busy !== null || mainDirty === 0} onClick={saveAll}>
              {busy !== null ? <Busy>Saving…</Busy> : "Save"}
            </button>
          </div>
        )}
      </div>

      )}

      {tab === "outer" && (
        <div className="erp-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="mb-1 text-base font-semibold">Bags</h3>
              <p className="erp-hint !mb-0">
                Domestic and export qty per finished piece for each size. 0 deducts nothing.
                {families.length > 0 && <> A shared column (such as 25 Bags) is one qty for all its bags; Step 4 picks the bag by the brand, set on the Products tab.</>}
              </p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-3">
                {outers.map((o) => notes[o.id] && (
                  <span key={o.id} className={`text-xs font-semibold ${notes[o.id].ok ? "text-emerald-700" : "text-red-700"}`}>{o.name}: {notes[o.id].text}</span>
                ))}
                {families.map((f) => famNote[f.name] && (
                  <span key={f.name} className={`text-xs font-semibold ${famNote[f.name].ok ? "text-emerald-700" : "text-amber-800"}`}>{f.name}: {famNote[f.name].text}</span>
                ))}
                <button type="button" className="erp-btn mt-0" disabled={busy !== null || (!outers.some((o) => dirty.has(o.id)) && !bagsDirty)} onClick={saveOuter}>
                  {busy !== null ? <Busy>Saving…</Busy> : "Save"}
                </button>
              </div>
            )}
          </div>
          {outers.length === 0 && families.length === 0 ? (
            <p className="mt-4 text-sm text-[#737373]">Bag items are not set up yet. Reload the page.</p>
          ) : (
          <>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Product type">
            {[{ name: "all", label: "All", n: sizes.length }, ...types.map((t) => ({ name: t.name, label: t.name, n: typeCount(t.name) }))].map((t) => (
              <button
                key={t.name}
                type="button"
                role="tab"
                aria-selected={outerType === t.name}
                onClick={() => setOuterType(t.name)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${outerType === t.name ? "border-[#171717] bg-[#171717] text-white" : "border-[#e5e5e5] bg-white text-[#737373] hover:bg-[#f5f5f5]"}`}
              >
                {t.label} <span className={`ml-1 text-xs ${outerType === t.name ? "text-white/75" : "text-[#a3a3a3]"}`}>{t.n}</span>
              </button>
            ))}
          </div>
          <div className="erp-compact mt-4 w-full overflow-x-auto rounded-xl border border-[#e5e5e5]">
            <table className="m-0 w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col className="w-[16%]" />
                {bagCols.map((c) => (
                  <Fragment key={c.key}>
                    <col />
                    <col />
                  </Fragment>
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2} className="border-b border-[#e5e5e5] bg-[#fafafa] px-5 py-2 text-left align-bottom text-xs font-bold uppercase tracking-wide text-[#737373]">Size</th>
                  {bagCols.map((c, gi) => (
                    <th key={c.key} colSpan={2} className={`border-b border-l border-[#e5e5e5] px-3 py-3 text-center text-sm font-bold uppercase tracking-wide ${c.shared ? "bg-[#eef2ff] text-[#3730a3]" : gi % 2 === 0 ? "bg-[#f5f5f5] text-[#171717]" : "bg-[#e8f3ee] text-[#1f6a4a]"}`}>
                      {c.title}
                      {c.sub && <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal opacity-80">{c.sub}</span>}
                    </th>
                  ))}
                </tr>
                <tr>
                  {bagCols.map((c) => (
                    <Fragment key={c.key}>
                      <th className="border-b border-l border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-center text-xs font-semibold text-[#737373]">Domestic</th>
                      <th className="border-b border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-center text-xs font-semibold text-[#737373]">Export</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outerSizes.length === 0 && (
                  <tr>
                    <td colSpan={1 + bagCols.length * 2} className="px-5 py-3 text-[#737373]">No sizes in this type.</td>
                  </tr>
                )}
                {outerSizes.map((size, ri) => (
                  <tr key={size} className={`${ri % 2 ? "bg-[#fafafa]" : "bg-white"} hover:bg-[#fafafa]`}>
                    <td className="border-b border-[#e5e5e5] px-5 py-1.5 text-sm font-semibold text-[#404040]">{size}</td>
                    {bagCols.map((c) => {
                      const cur = c.get(size);
                      const cell = (field: "qty" | "exportQty", first: boolean) => {
                        const v = cur?.[field] ?? "0";
                        const set = Number(v) > 0;
                        return (
                          <td className={`border-b border-[#e5e5e5] px-3 py-1.5 ${first ? "border-l" : ""}`}>
                            <input
                              className={`erp-input mt-0 w-full text-center ${set ? "border-[#d4d4d4] bg-[#fafafa] font-semibold text-[#171717]" : "text-[#a3a3a3]"}`}
                              type="number"
                              min={0}
                              step="0.0001"
                              value={v}
                              disabled={!isAdmin}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => c.set(size, { [field]: e.target.value })}
                            />
                          </td>
                        );
                      };
                      return (
                        <Fragment key={c.key}>
                          {cell("qty", true)}
                          {cell("exportQty", false)}
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}
