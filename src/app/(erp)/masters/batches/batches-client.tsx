"use client";

import { IconAction } from "@/components/icon-action";
import { Modal } from "@/components/modal";
import { AddButton } from "@/components/add-button";
import { Select } from "@/components/select";
import { ExpandIcon } from "@/components/expand-icon";
import { ScrollLock } from "@/lib/use-scroll-lock";
import { Busy } from "@/components/spinner";
import { Notice } from "@/components/notice";
import { useSubmit } from "@/lib/use-submit";
import { Skeleton } from "@/components/skeleton";
import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";

type Material = {
  id: number;
  code: string;
  name: string;
  unit: string;
  raw_material_id: number | null;
  cons_qty: number;
};
type Recipe = {
  id: number;
  code: string;
  name: string | null;
  batch_type: string;
  total_kg: number;
  master_kg?: number;
  items: { material_id: number; code: string; name: string; kg: number }[];
};
type Line = { material_id: number; cons_qty: string };

/** 2.5 -> 2.50, 2.50000 -> 2.50, 84 -> 84.00, 3.4205 -> 3.4205. At least 2 decimals, at most 4. */
const qtyFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false });
const fmtQty = (n: number) => qtyFormat.format(Number(n) || 0);

export function BatchesClient({ isAdmin, canAdd = isAdmin, canDelete = isAdmin }: { isAdmin: boolean; canAdd?: boolean; canDelete?: boolean }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ready, setReady] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [name, setName] = useState("");
  const [batchType, setBatchType] = useState<"MASTER" | "FINAL">("MASTER");
  const [masterKg, setMasterKg] = useState("60");
  const [lines, setLines] = useState<Line[]>([{ material_id: 0, cons_qty: "" }]);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<Recipe | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [editing, setEditing] = useState<Recipe | null>(null);

  async function load() {
    const [r, m] = await Promise.all([
      api<Recipe[]>("/api/masters/batches"),
      api<Material[]>("/api/masters/inventory?group=Raw%20Material"),
    ]);
    setRecipes(r);
    setReady(true);
    setMaterials(m.filter((row) => row.raw_material_id));
    const first = m.find((row) => row.raw_material_id);
    if (first?.raw_material_id) {
      setLines((prev) => (prev[0]?.material_id ? prev : [lineFrom(first)]));
    }
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function lineFrom(material: Material): Line {
    return {
      material_id: material.raw_material_id ?? 0,
      cons_qty: material.cons_qty ? String(material.cons_qty) : "",
    };
  }

  useEffect(() => {
    load().catch(() => setReady(true));
  }, []);

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/api/masters/batches?id=${pending.id}`, { method: "DELETE" }, { quiet: true });
      setMsg(`${pending.name || pending.code} deleted`);
      setPending(null);
      await load();
    } catch (e) {
      setDeleteError(e instanceof ApiClientError ? e.message : "Could not delete formula");
    } finally {
      setDeleting(false);
    }
  }

  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const toggleOpen = (id: number) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function saveEdit(form: { name: string; batch_type: "MASTER" | "FINAL"; master_kg: number; items: { material_id: number; kg: number }[] }) {
    if (!editing) return;
    await api("/api/masters/batches", { method: "PATCH", body: JSON.stringify({ id: editing.id, ...form }) });
    setMsg(`${form.name} saved`);
    setEditing(null);
    await load();
  }

  const [creating, setCreating] = useState(false);
  const [createOnce, createBusy] = useSubmit(create);
  async function create() {
    try {
      await api("/api/masters/batches", {
        method: "POST",
        body: JSON.stringify({
          name,
          batch_type: batchType,
          master_kg: Number(masterKg) > 0 ? Number(masterKg) : 60,
          items: lines
            .map((l) => ({
              material_id: l.material_id,
              kg: Number(l.cons_qty),
            }))
            .filter((l) => l.kg > 0),
        }),
      });
      setName("");
      setMsg("Batch formula saved");
      setCreating(false);
      await load();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "Could not save formula");
    }
  }

  return (
    <div className="space-y-4">
      {msg && <Notice text={msg} onDone={() => setMsg("")} />}
      {canAdd && creating && (
        <Modal title="New formula" onClose={() => setCreating(false)} busy={createBusy} size="lg">
        <div>
          <p className="erp-hint">Enter the KG of each raw material for one batch. Stock is only used when the batch is posted in the Mixing Department.</p>
          {materials.length === 0 && <p className="erp-hint">Add a Raw Material in Item Master first. Each line needs a material and a quantity.</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="erp-label">Name<input className="erp-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="erp-label">
              Type
              <Select className="erp-input" value={batchType} onChange={(e) => setBatchType(e.target.value as "MASTER" | "FINAL")}>
                <option value="MASTER">Master batch formula</option>
                <option value="FINAL">Final batch formula</option>
              </Select>
            </label>
            {batchType === "FINAL" && (
              <label className="erp-label">
                Final KG per batch
                <input className="erp-input" type="number" min={0} step="0.001" value={masterKg} onChange={(e) => setMasterKg(e.target.value)} />
              </label>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="erp-table erp-stack">
              <thead>
                <tr>
                  {["Product", "Unit", "Cons. Qty", "Remove"].map((h) => <th key={h} className={h === "Remove" ? "w-16 text-center" : ""}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const material = materials.find((m) => m.raw_material_id === line.material_id);
                  return (
                    <tr key={i} className="max-lg:[grid-template-columns:minmax(0,1fr)_auto]!">
                      <td className="erp-stack-full" data-label={`Material ${i + 1}`}>
                        <Select className="erp-input mt-0 lg:min-w-48" value={line.material_id} onChange={(e) => {
                          const picked = materials.find((m) => m.raw_material_id === Number(e.target.value));
                          const next = [...lines];
                          next[i] = picked ? lineFrom(picked) : { ...line, material_id: Number(e.target.value) };
                          setLines(next);
                        }}>
                          {materials.map((m) => <option key={m.id} value={m.raw_material_id ?? 0}>{m.name}</option>)}
                        </Select>
                      </td>
                      <td className="max-lg:!hidden">{material?.unit || "KGS"}</td>
                      <td data-label={`Cons. Qty (${material?.unit || "KGS"})`}><input className="erp-input mt-0 w-full lg:w-28" type="number" step="0.0001" value={line.cons_qty} onChange={(e) => updateLine(i, { cons_qty: e.target.value })} /></td>
                      <td className="text-center max-lg:self-end">
                        <button
                          type="button"
                          aria-label="Delete material line"
                          title="Delete line"
                          disabled={lines.length <= 1}
                          onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                          className="inline-grid h-9 w-9 place-items-center rounded-lg bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2] disabled:cursor-not-allowed disabled:opacity-40 max-lg:h-11 max-lg:w-11"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="erp-btn erp-btn-secondary" onClick={() => setLines([...lines, materials[0] ? lineFrom(materials[0]) : { material_id: 0, cons_qty: "" }])}>+ Material line</button>
          <div className="mt-2 flex flex-col-reverse gap-2 border-t border-[#f0f0f0] pt-4 sm:flex-row sm:justify-end [&>button]:m-0">
            <button type="button" className="erp-btn erp-btn-secondary" onClick={() => setCreating(false)} disabled={createBusy}>Cancel</button>
            <button type="button" className="erp-btn" onClick={createOnce} disabled={createBusy}>{createBusy ? <Busy>Saving…</Busy> : "Save formula"}</button>
          </div>
        </div>
        </Modal>
      )}
      <div className="erp-panel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-lg font-semibold leading-tight">Saved formulas</h2>
            {recipes.length > 0 && (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#737373]">
                <span>{recipes.length} formula{recipes.length === 1 ? "" : "s"}</span>
                <span aria-hidden>·</span>
                <button type="button" className="font-semibold text-[#404040] hover:text-black hover:underline" onClick={() => setOpenIds(openIds.size === recipes.length ? new Set() : new Set(recipes.map((x) => x.id)))}>
                  {openIds.size === recipes.length ? "Collapse all" : "Expand all"}
                </button>
              </div>
            )}
          </div>
          {canAdd && <AddButton label="New formula" onClick={() => setCreating(true)} />}
        </div>
        {!ready && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}
        {ready && recipes.length === 0 && <p className="text-sm text-[#a3a3a3]">No formulas yet.</p>}
        <div className="space-y-2">
          {recipes.map((r) => (
            <div key={r.id} className="rounded-xl border border-[#e5e5e5] bg-white">
              <div className="flex items-center gap-2 py-2 pl-2 pr-1.5 sm:gap-3 sm:pl-3 sm:pr-2">
                <button type="button" onClick={() => toggleOpen(r.id)} aria-expanded={openIds.has(r.id)} className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left">
                  <ExpandIcon open={openIds.has(r.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${r.batch_type === "FINAL" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>{r.batch_type === "FINAL" ? "FINAL" : "MASTER"}</span>
                      <b className="truncate text-[15px] text-[#0a0a0a]">{r.name || r.code}</b>
                      <span className="shrink-0 text-xs tabular-nums text-[#a3a3a3]">#{r.code}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#737373]">
                      {r.items.length} material{r.items.length === 1 ? "" : "s"} · <b className="font-semibold text-[#171717]">{fmtQty(r.total_kg)} KG</b>
                      {r.batch_type === "FINAL" ? ` · Final ${fmtQty(r.master_kg ?? 60)} KG/batch` : ""}
                    </span>
                  </span>
                </button>
                {(isAdmin || canDelete) && (
                  <span className="flex shrink-0 items-center">
                    {isAdmin && (
                      <IconAction kind="edit" label="Edit" onClick={() => setEditing(r)} />
                    )}
                    {canDelete && (
                      <IconAction
                        kind="delete"
                        label="Delete"
                        onClick={() => {
                          setDeleteError("");
                          setPending(r);
                        }}
                      />
                    )}
                  </span>
                )}
              </div>
              {openIds.has(r.id) && (
              <div className="border-t border-[#f0f0f0] px-3 pb-3">
              <table className="erp-table mt-2">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Unit</th>
                    <th className="text-right">KG per batch</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((i) => (
                    <tr key={i.material_id}>
                      <td>{i.name}</td>
                      <td className="text-[#737373]">KGS</td>
                      <td className="text-right tabular-nums">{fmtQty(i.kg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <EditBatchDialog
          recipe={editing}
          materials={materials}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
      {pending && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#0a0a0a]/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => e.target === e.currentTarget && !deleting && setPending(null)}
          onKeyDown={(e) => e.key === "Escape" && !deleting && setPending(null)}
        >
          <ScrollLock />
          <div role="alertdialog" aria-modal="true" aria-labelledby="del-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fef2f2] text-[#dc2626]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </span>
              <div>
                <h2 id="del-title" className="text-lg font-bold text-[#171717]">Delete this formula?</h2>
                <p className="mt-1 text-sm text-[#737373]">
                  <b>{pending.name || pending.code}</b> ({pending.batch_type}, {fmtQty(pending.total_kg)} KG, {pending.items.length} material{pending.items.length === 1 ? "" : "s"}) will be removed from the list. Batches already posted from it are not affected.
                </p>
              </div>
            </div>
            {deleteError && <p className="mt-3 text-sm font-semibold text-red-700">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" autoFocus className="erp-btn erp-btn-secondary mt-0" onClick={() => setPending(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="erp-btn mt-0 !bg-[#dc2626]" onClick={confirmDelete} disabled={deleting}>
                {deleting ? <Busy>Deleting…</Busy> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditBatchDialog({
  recipe,
  materials,
  onClose,
  onSave,
}: {
  recipe: Recipe;
  materials: Material[];
  onClose: () => void;
  onSave: (form: { name: string; batch_type: "MASTER" | "FINAL"; master_kg: number; items: { material_id: number; kg: number }[] }) => Promise<void>;
}) {
  const [name, setName] = useState(recipe.name ?? "");
  const [type, setType] = useState<"MASTER" | "FINAL">(recipe.batch_type === "FINAL" ? "FINAL" : "MASTER");
  const [masterKgText, setMasterKgText] = useState(String(recipe.master_kg ?? 60));
  const [lines, setLines] = useState<Line[]>(recipe.items.map((i) => ({ material_id: i.material_id, cons_qty: String(Number(i.kg)) })));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // A material that was deleted from Item Master still shows, so the line is not lost silently.
  const options = [
    ...materials.map((m) => ({ id: m.raw_material_id ?? 0, name: m.name })),
    ...recipe.items.filter((i) => !materials.some((m) => m.raw_material_id === i.material_id)).map((i) => ({ id: i.material_id, name: `${i.name} (removed)` })),
  ];

  const lineErrors = lines.map((l, i) => {
    if (!l.material_id) return "Choose a material.";
    if (lines.findIndex((x) => x.material_id === l.material_id) !== i) return "Already listed above.";
    const kg = Number(l.cons_qty);
    if (l.cons_qty.trim() === "" || !(kg > 0)) return "Enter KG above 0.";
    return "";
  });
  const problems = {
    name: name.trim() ? "" : "Enter a name.",
    master: type === "FINAL" && !(Number(masterKgText) > 0) ? "Enter the master KG above 0." : "",
    lines: lines.length === 0 ? "Add at least one material." : lineErrors.some(Boolean) ? "Fix the highlighted lines." : "",
  };
  const invalid = Object.values(problems).some(Boolean);
  const total = lines.reduce((sum, l) => sum + (Number(l.cons_qty) > 0 ? Number(l.cons_qty) : 0), 0);
  const show = (m: string) => (tried && m ? <span className="mt-1 block text-xs font-semibold text-red-700">{m}</span> : null);

  async function submit() {
    setTried(true);
    if (invalid) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        batch_type: type,
        master_kg: type === "FINAL" ? Number(masterKgText) : recipe.master_kg ?? 60,
        items: lines.map((l) => ({ material_id: l.material_id, kg: Number(l.cons_qty) })),
      });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not save formula");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0a0a0a]/55 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <ScrollLock />
      <div role="dialog" aria-modal="true" aria-label="Edit formula" className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#e5e5e5] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#171717]">Edit formula</h2>
            <p className="mt-0.5 text-sm text-[#737373]">Changes apply to new mixes. Batches already posted are not changed.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-[#737373] hover:bg-[#f5f5f5]">×</button>
        </header>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="block text-sm font-semibold text-[#404040]">
              Code
              <div className="erp-input flex items-center bg-[#f5f5f5] text-[#737373]">{recipe.code}</div>
            </div>
            <label className="block text-sm font-semibold text-[#404040]">
              Name <span className="text-red-600">*</span>
              <input className={`erp-input ${tried && problems.name ? "border-red-400" : ""}`} value={name} onChange={(e) => setName(e.target.value)} />
              {show(problems.name)}
            </label>
            <label className="block text-sm font-semibold text-[#404040]">
              Type
              <Select className="erp-input" value={type} onChange={(e) => setType(e.target.value as "MASTER" | "FINAL")}>
                <option value="MASTER">Master batch formula</option>
                <option value="FINAL">Final batch formula</option>
              </Select>
            </label>
            {type === "FINAL" && (
              <label className="block text-sm font-semibold text-[#404040]">
                Final KG per batch <span className="text-red-600">*</span>
                <input className={`erp-input ${tried && problems.master ? "border-red-400" : ""}`} type="number" min={0} step="0.001" value={masterKgText} onChange={(e) => setMasterKgText(e.target.value)} />
                {show(problems.master)}
              </label>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#737373]">Materials</h3>
              <span className="text-sm text-[#737373]">Total <b>{fmtQty(total)} KG</b></span>
            </div>
            <div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
              <table className="erp-table m-0">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="w-32">KG</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <Select
                          className="erp-input mt-0"
                          value={l.material_id}
                          onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, material_id: Number(e.target.value) } : x)))}
                        >
                          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </Select>
                        {tried && lineErrors[i] && <span className="mt-1 block text-xs font-semibold text-red-700">{lineErrors[i]}</span>}
                      </td>
                      <td className="align-top">
                        <input
                          className={`erp-input mt-0 ${tried && lineErrors[i] ? "border-red-400" : ""}`}
                          type="number"
                          min={0}
                          step="0.0001"
                          value={l.cons_qty}
                          onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, cons_qty: e.target.value } : x)))}
                        />
                      </td>
                      <td className="align-top">
                        <button
                          type="button"
                          aria-label="Remove line"
                          title="Remove line"
                          onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                          className="grid h-8 w-8 place-items-center rounded-md text-[#dc2626] hover:bg-[#fef2f2]"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {show(problems.lines)}
            <button
              type="button"
              className="mt-2 rounded-md border border-dashed border-[#d4d4d4] px-2.5 py-1 text-xs font-semibold text-[#171717] hover:bg-[#fafafa]"
              onClick={() => {
                const unused = options.find((o) => o.id && !lines.some((l) => l.material_id === o.id));
                setLines([...lines, { material_id: (unused ?? options[0])?.id ?? 0, cons_qty: "" }]);
              }}
            >
              + Add material
            </button>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e5e5] bg-[#fafafa] px-6 py-4">
          <p className={`text-sm font-medium ${error || (tried && invalid) ? "text-red-700" : "text-[#737373]"}`} role="alert">
            {error || (tried && invalid ? "Fix the highlighted fields to continue." : "Fields marked * are required.")}
          </p>
          <div className="flex gap-2">
            <button type="button" className="erp-btn erp-btn-secondary mt-0" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="erp-btn mt-0 min-w-28" onClick={submit} disabled={busy}>{busy ? <Busy>Saving…</Busy> : "Save changes"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
