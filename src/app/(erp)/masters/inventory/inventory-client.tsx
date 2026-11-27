"use client";

import { ScrollLock } from "@/lib/use-scroll-lock";
import { Busy } from "@/components/spinner";
import { Notice } from "@/components/notice";
import { useConfirm } from "@/components/confirm";
import { SkeletonRows } from "@/components/skeleton";
import { useSubmit } from "@/lib/use-submit";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiClientError } from "@/lib/client-api";
import { INVENTORY_UNITS } from "@/lib/erp/units";

type Row = {
  id: number;
  code: string;
  name: string;
  unit: string;
  unit_qty: number;
  conv_unit: string;
  alt_qty: number | null;
  alt_unit: string;
  marking: string;
  item_size: string;
  quality: string;
  cons_qty: number;
  mfg_use: string;
  group: string;
};

const EMPTY = {
  code: "",
  name: "",
  unit: "KGS" as (typeof INVENTORY_UNITS)[number],
  unit_qty: 1,
  conv_unit: "BAG" as (typeof INVENTORY_UNITS)[number],
  alt_qty: "" as number | "",
  alt_unit: "PCS" as (typeof INVENTORY_UNITS)[number],
  marking: "",
  item_size: "",
  quality: "",
  cons_qty: 0,
  mfg_use: "",
  group: "Raw Material",
};

function unitForGroup(group: string): (typeof INVENTORY_UNITS)[number] {
  return group.trim().toLowerCase() === "raw material" ? "KGS" : "PCS";
}


function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#737373]">{label}</span>
      {children}
    </label>
  );
}

function alterLabel(row: Pick<Row, "conv_unit" | "unit_qty" | "alt_qty" | "alt_unit">) {
  if (!row.alt_unit || row.alt_qty == null) return "—";
  const n = (v: number) => String(Number(Number(v).toFixed(4)));
  return `${n(row.unit_qty)} ${row.conv_unit || "BAG"} = ${n(row.alt_qty)} ${row.alt_unit}`;
}

type Named = { id: number; code: string; name: string };

export function InventoryClient({ isAdmin, canAdd = isAdmin, canDelete = isAdmin }: { isAdmin: boolean; canAdd?: boolean; canDelete?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);
  const [groupOptions, setGroupOptions] = useState<Named[]>([]);
  const [group, setGroup] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [msgError, setMsgError] = useState(false);

  async function load() {
    const [items, groups] = await Promise.all([
      api<Row[]>("/api/masters/inventory"),
      api<Named[]>("/api/masters/groups"),
    ]);
    setRows(Array.isArray(items) ? items : []);
    setGroupOptions(Array.isArray(groups) ? groups : []);
    setReady(true);
  }

  useEffect(() => {
    load().catch(() => { setRows([]); setReady(true); });
  }, []);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditing(null);
        setForm(EMPTY);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const itemRows = Array.isArray(rows) ? rows : [];
  const optionNames = (Array.isArray(groupOptions) ? groupOptions : []).map((g) => g.name);
  const groups = [
    ...optionNames,
    ...itemRows.map((row) => row.group).filter((name) => name && !optionNames.includes(name)),
  ];
  // Every word typed must match somewhere on the item: code, name, unit, group, alter unit, size, quality, marking and so on.
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searchText = (row: Row) =>
    [row.code, row.name, row.unit, row.group, alterLabel(row), row.marking, row.item_size, row.quality, row.mfg_use, row.cons_qty ? String(row.cons_qty) : "", row.alt_unit]
      .join(" ")
      .toLowerCase();
  const shown = itemRows.filter((row) => (group === "all" || row.group === group) && (words.length === 0 || words.every((w) => searchText(row).includes(w))));

  function reset() {
    setEditing(null);
    setForm(EMPTY);
  }

  const confirm = useConfirm();
  async function remove(row: Row) {
    if (!(await confirm({ title: `Delete ${row.name}?`, body: `Code ${row.code} is removed from ${row.group}.` }))) return;
    try {
      await api(`/api/masters/inventory?id=${row.id}`, { method: "DELETE" });
      if (editing === row.id) reset();
      setMsgError(false);
      setMsg(`${row.name} deleted`);
      await load();
    } catch (e) {
      setMsgError(true);
      setMsg(e instanceof ApiClientError ? e.message : "Could not delete item");
    }
  }

  const [saveOnce, saveBusy] = useSubmit(save);
  async function save() {
    if (!form.name.trim()) {
      setMsgError(true);
      setMsg("Enter the material name.");
      return;
    }
    const finished = form.group.trim().toLowerCase() === "finished goods";
    const payload = {
      name: form.name,
      unit: form.unit,
      unit_qty: finished ? Number(form.unit_qty) || 1 : 1,
      conv_unit: form.conv_unit,
      alt_qty: finished && form.alt_qty !== "" ? Number(form.alt_qty) : null,
      alt_unit: finished && form.alt_qty !== "" ? form.alt_unit : "",
      marking: form.marking,
      item_size: form.item_size,
      quality: form.quality,
      cons_qty: Number(form.cons_qty) || 0,
      mfg_use: form.mfg_use,
      group: form.group.trim(),
    };
    try {
      await api("/api/masters/inventory", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(editing ? { id: editing, ...payload } : payload),
      });
      setMsgError(false);
      setMsg(editing ? "Item saved" : `Saved in group ${payload.group}`);
      reset();
      await load();
    } catch (e) {
      setMsgError(true);
      setMsg(e instanceof ApiClientError ? e.message : "Could not save item");
    }
  }

  const finishedGood = form.group.trim().toLowerCase() === "finished goods";

  const formBody = (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#171717]">{editing ? `Edit item ${form.code}` : "Add item"}</h2>
        <p className="mt-1 text-sm text-[#737373]">Group comes from Group Entry. The code is assigned automatically. Unit starts from the group (Raw Material is KGS, Finished Goods and others are PCS) and you can change it. Alter unit is only for Finished Goods.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Material name">
          <input className="erp-input mt-0" placeholder="RECLAIM RUBBER" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Group">
          <select className="erp-input mt-0" value={form.group} onChange={(e) => {
            const next = e.target.value;
            setForm({ ...form, group: next, unit: unitForGroup(next) });
          }}>
            {groupOptions.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Unit">
          <select className="erp-input mt-0" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as (typeof INVENTORY_UNITS)[number] })}>
            {INVENTORY_UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
      </div>

      {finishedGood && (
        <section className="mt-4 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
          <h3 className="text-sm font-semibold text-[#171717]">Alter unit</h3>
          <p className="mt-1 text-xs text-[#737373]">The three units are independent: main unit above, then the two units of the conversion. For example 1 BAG = 100 PCS. Leave the second Qty empty when there is no alter unit.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Qty" className="w-28">
              <input
                className="erp-input mt-0"
                type="number"
                min={0}
                step="0.0001"
                value={form.unit_qty}
                onChange={(e) => setForm({ ...form, unit_qty: Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit" className="w-32">
              <select className="erp-input mt-0" value={form.conv_unit} onChange={(e) => setForm({ ...form, conv_unit: e.target.value as (typeof INVENTORY_UNITS)[number] })}>
                {INVENTORY_UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <span className="mb-2 px-1 text-lg font-semibold text-[#171717]">=</span>
            <Field label="Qty" className="w-32">
              <input
                className="erp-input mt-0"
                type="number"
                min={0}
                step="0.0001"
                placeholder="100"
                value={form.alt_qty}
                onChange={(e) => setForm({ ...form, alt_qty: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit" className="w-32">
              <select className="erp-input mt-0" value={form.alt_unit} onChange={(e) => setForm({ ...form, alt_unit: e.target.value as (typeof INVENTORY_UNITS)[number] })}>
                {INVENTORY_UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </div>
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[#e5e5e5] pt-4">
        {msg && <Notice text={msg} kind={msgError ? "error" : "success"} onDone={() => setMsg("")} />}
        {editing && (
          <button type="button" className="erp-btn erp-btn-secondary mt-0" onClick={reset}>Cancel</button>
        )}
        <button type="button" className="erp-btn mt-0" onClick={saveOnce} disabled={saveBusy}>{saveBusy ? <Busy>Saving…</Busy> : editing ? "Save changes" : "Save item"}</button>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {canAdd && !editing && <div className="erp-panel">{formBody}</div>}
      {isAdmin && editing && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0a0a0a]/55 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && reset()}
        >
          <ScrollLock />
          <div role="dialog" aria-modal="true" aria-label="Edit item" className="relative max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
            <button type="button" aria-label="Close" onClick={reset} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg text-xl leading-none text-[#737373] hover:bg-[#f5f5f5]">
              ×
            </button>
            {formBody}
          </div>
        </div>
      )}
      <div className="erp-panel overflow-x-auto">
        <div className="relative mb-3 w-full">
          <input
            className="erp-input mt-0 w-full pr-10"
            type="search"
            placeholder="Search code, name, unit, group…"
            aria-label="Search Item Master"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[#737373] hover:bg-[#f5f5f5]">
              ×
            </button>
          )}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${group === "all" ? "border-[#171717] bg-[#171717] text-white" : "border-[#e5e5e5] bg-white text-[#737373] hover:bg-[#f5f5f5]"}`} onClick={() => setGroup("all")}>All</button>
          {groups.map((g) => (
            <button key={g} type="button" className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${group === g ? "border-[#171717] bg-[#171717] text-white" : "border-[#e5e5e5] bg-white text-[#737373] hover:bg-[#f5f5f5]"}`} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
        <table className="erp-table erp-stack">
          <thead>
            <tr>
              {["Material Code", "Material Name", "Unit", "Alter Unit", "Group", ""].map((h) => <th key={h || "edit"}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {!ready && <SkeletonRows rows={8} cols={6} />}
            {ready && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="text-[#737373]">
                  {words.length ? `No items match "${query.trim()}".` : "No items in this group."}
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold max-lg:col-span-2 max-lg:text-[15px]"><span className="mr-2 text-[#a3a3a3] lg:hidden">#{r.code}</span><span className="hidden lg:inline">{r.code}</span><span className="lg:hidden">{r.name}</span></td>
                <td className="max-lg:!hidden">{r.name}</td>
                <td data-label="Unit">{r.unit}</td>
                <td data-label="Alter Unit">{alterLabel(r)}</td>
                <td className="erp-stack-full" data-label="Group">{r.group}</td>
                <td className="erp-stack-full">
                  {(isAdmin || canDelete) && (
                    <div className="flex items-center gap-2 max-lg:[&_.erp-btn]:flex-1">
                    {isAdmin && (
                    <button
                      type="button"
                      className="erp-btn erp-btn-secondary mt-0"
                      onClick={() => {
                        setEditing(r.id);
                        setForm({
                          code: r.code,
                          name: r.name,
                          unit: (INVENTORY_UNITS as readonly string[]).includes(r.unit) ? r.unit as (typeof INVENTORY_UNITS)[number] : "PCS",
                          unit_qty: r.unit_qty || 1,
                          alt_qty: r.alt_qty ?? "",
                          conv_unit: ((INVENTORY_UNITS as readonly string[]).includes(r.conv_unit) ? r.conv_unit : "BAG") as (typeof INVENTORY_UNITS)[number],
                          alt_unit: ((INVENTORY_UNITS as readonly string[]).includes(r.alt_unit) ? r.alt_unit : "PCS") as (typeof INVENTORY_UNITS)[number],
                          marking: r.marking || "",
                          item_size: r.item_size || "",
                          quality: r.quality || "",
                          cons_qty: r.cons_qty || 0,
                          mfg_use: r.mfg_use || "",
                          group: r.group,
                        });
                        setMsg("");
                        setMsgError(false);
                      }}
                    >
                      Edit
                    </button>
                    )}
                    {canDelete && (
                    <button
                      type="button"
                      aria-label={`Delete ${r.name}`}
                      title="Delete item"
                      onClick={() => remove(r)}
                      className="grid h-10 w-10 place-items-center rounded-lg bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2]"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                    )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
