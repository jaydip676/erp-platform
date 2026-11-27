"use client";

import { useConfirm } from "@/components/confirm";
import { SkeletonRows } from "@/components/skeleton";
import { useSubmit } from "@/lib/use-submit";
import { useEffect, useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";

type Item = {
  id: number;
  kind: string;
  category: string;
  sr_no: number;
  size: string;
  valve: string;
  packing: string;
  bag_pcs: number | null;
  bags: number | null;
  domestic_qty: number;
  export_qty: number;
  bag_item: string;
  weight_kg: number;
  ex_kg: number;
};

type ProductType = { id: number; name: string };
type Inventory = { id: number; code: string; name: string; unit: string; group: string; raw_material_id: number | null };

type Form = {
  category: string;
  size: string;
  valve: string;
  bag_pcs: number;
  bags: number;
  domestic_qty: number;
  export_qty: number;
  weight_kg: number;
  ex_kg: number;
};

const EMPTY: Form = {
  category: "",
  size: "",
  valve: "",
  bag_pcs: 20,
  bags: 1,
  domestic_qty: 20,
  export_qty: 20,
  weight_kg: 0,
  ex_kg: 0,
};

function bagsLabel(row: { bag_pcs: number | null; bags: number | null; packing: string }) {
  if (row.bag_pcs && row.bags) return `${row.bag_pcs}PCS X ${row.bags}`;
  return row.packing || "—";
}

function formatKg(n: number) {
  if (!n) return "0";
  return String(Number(n.toFixed(3)));
}

function formatPct(n: number) {
  if (!n) return "0%";
  return `${Number(n.toFixed(2))}%`;
}

export function ProductsClient({ isAdmin, canDelete = isAdmin }: { isAdmin: boolean; canDelete?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [types, setTypes] = useState<ProductType[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [tab, setTab] = useState("all");
  const [addingType, setAddingType] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeError, setTypeError] = useState("");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState(false);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    api<Item[]>("/api/catalog").then(setItems).catch(() => setItems([])).finally(() => setReady(true));
    api<ProductType[]>("/api/product-types").then(setTypes).catch(() => setTypes([]));
    api<Inventory[]>("/api/masters/inventory").then(setInventory).catch(() => setInventory([]));
  }, []);

  // Every type gets a tab: managed types first, then any type name that only exists on products.
  const tabTypes = useMemo(() => {
    const list: { id: number | null; name: string }[] = types.map((t) => ({ id: t.id, name: t.name }));
    const seen = new Set(list.map((t) => t.name.toLowerCase()));
    for (const i of items) {
      const name = i.category.trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push({ id: null, name });
      }
    }
    return list;
  }, [types, items]);
  const categories = useMemo(() => tabTypes.map((t) => t.name), [tabTypes]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (tab !== "all" && i.category !== tab) return false;
      if (!q) return true;
      return `${i.size} ${i.valve} ${i.category}`.toLowerCase().includes(q);
    });
  }, [items, tab, query]);

  const finished = inventory.filter((i) => i.group === "Finished Goods");
  const store = inventory.filter((i) => i.group === "Store Item");

  function openEdit(row: Item) {
    setFormError("");
    setEditing(row);
    setAdding(false);
    setForm({
      category: row.category,
      size: row.size,
      valve: row.valve,
      bag_pcs: row.bag_pcs ?? 0,
      bags: row.bags ?? 0,
      domestic_qty: row.domestic_qty,
      export_qty: row.export_qty,
      weight_kg: row.weight_kg ?? 0,
      ex_kg: row.ex_kg ?? 0,
    });
  }

  function openAdd() {
    setFormError("");
    setEditing(null);
    setAdding(true);
    setForm({ ...EMPTY, category: tab !== "all" ? tab : categories[0] || "" });
  }

  function closeDialog() {
    setEditing(null);
    setAdding(false);
    setFormError("");
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    setFormError("");
    try {
      const saved = await api<Item>("/api/catalog", {
        method: "PATCH",
        body: JSON.stringify({
          id: editing.id,
          category: form.category.trim(),
          size: form.size,
          valve: form.valve,
          bag_item: editing.bag_item,
          bag_pcs: form.bag_pcs || null,
          bags: form.bags || null,
          domestic_qty: form.domestic_qty,
          export_qty: form.export_qty,
          weight_kg: form.weight_kg,
          ex_kg: form.ex_kg,
        }),
      });
      setItems((list) => list.map((i) => (i.id === editing.id ? { ...i, ...saved } : i)));
      setMsg(`${form.size} saved`);
      closeDialog();
    } catch (e) {
      setFormError(e instanceof ApiClientError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const confirm = useConfirm();
  async function deleteProduct(row: Item) {
    const label = [row.size, row.valve].filter(Boolean).join(" / ");
    if (!(await confirm({ title: `Delete ${label}?`, body: `It is removed from ${row.category}.` }))) return;
    try {
      await api(`/api/catalog?id=${row.id}`, { method: "DELETE" });
      setItems((list) => list.filter((i) => i.id !== row.id));
      setMsg(`${label} deleted`);
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "Could not delete product");
    }
  }

  async function saveNew() {
    setBusy(true);
    setFormError("");
    try {
      await api("/api/catalog", {
        method: "POST",
        body: JSON.stringify({
          category: form.category.trim(),
          size: form.size,
          valve: form.valve,
          bag_pcs: form.bag_pcs || null,
          bags: form.bags || null,
          domestic_qty: form.domestic_qty,
          export_qty: form.export_qty,
          weight_kg: form.weight_kg,
          ex_kg: form.ex_kg,
        }),
      });
      setItems(await api<Item[]>("/api/catalog"));
      setMsg("Product added");
      closeDialog();
    } catch (e) {
      setFormError(e instanceof ApiClientError ? e.message : "Could not add product");
    } finally {
      setBusy(false);
    }
  }

  function closeAddType() {
    setAddingType(false);
    setTypeName("");
    setTypeError("");
  }

  async function createType(name: string) {
    const created = await api<ProductType>("/api/product-types", { method: "POST", body: JSON.stringify({ name }) });
    setTypes((list) => (list.some((t) => t.id === created.id) ? list : [...list, created]));
    return created;
  }

  const [addTypeOnce, addTypeBusy] = useSubmit(addType);
  async function addType() {
    const name = typeName.trim();
    if (!name) {
      setTypeError("Enter a product type name.");
      return;
    }
    try {
      const created = await createType(name);
      setTab(created.name);
      setMsg(`${created.name} added`);
      closeAddType();
    } catch (e) {
      setTypeError(e instanceof ApiClientError ? e.message : "Could not add type");
    }
  }

  async function deleteType(type: ProductType) {
    const count = items.filter((i) => i.category === type.name).length;
    const warning = count
      ? `Delete "${type.name}" and its ${count} product${count === 1 ? "" : "s"} from the product list?`
      : `Delete the empty type "${type.name}"?`;
    if (!(await confirm({ title: warning }))) return;
    try {
      await api(`/api/product-types?id=${type.id}`, { method: "DELETE" });
      setTypes((list) => list.filter((t) => t.id !== type.id));
      setItems((list) => list.filter((i) => i.category !== type.name));
      if (tab === type.name) setTab("all");
      setTypeError("");
      setMsg(`${type.name} deleted`);
    } catch (e) {
      setTypeError(e instanceof ApiClientError ? e.message : "Could not delete type");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Same grey segmented switch as the inner tabs on Auto Consumption Packing. */}
        <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[#e5e5e5] bg-[#f4f4f5] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors lg:py-1.5 ${tab === "all" ? "bg-white text-[#171717] shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-[#737373] hover:text-[#171717]"}`}
          onClick={() => setTab("all")}
        >
          All<span className="ml-1.5 text-xs text-[#a3a3a3]">{items.length}</span>
        </button>
        {tabTypes.map((t) => {
          const count = items.filter((i) => i.category === t.name).length;
          const active = tab === t.name;
          return (
            <span key={t.name} className="group relative inline-flex shrink-0 items-center">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={`whitespace-nowrap rounded-lg py-2 pl-3.5 text-[13px] font-semibold transition-colors lg:py-1.5 ${canDelete && t.id != null ? "pr-3.5 group-hover:pr-9 group-focus-within:pr-9 max-lg:pr-10" : "pr-3.5"} ${active ? "bg-white text-[#171717] shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-[#737373] hover:text-[#171717]"}`}
                onClick={() => setTab(t.name)}
              >
                {t.name}<span className="ml-1.5 text-xs text-[#a3a3a3]">{count}</span>
              </button>
              {canDelete && t.id != null && (
                <button
                  type="button"
                  aria-label={`Delete type ${t.name}`}
                  title={`Delete ${t.name}`}
                  onClick={() => deleteType({ id: t.id as number, name: t.name })}
                  className="absolute right-1 grid h-6 w-6 place-items-center rounded-md bg-[#fef2f2] text-[#dc2626] opacity-0 transition-opacity hover:bg-[#fee2e2] focus:opacity-100 group-hover:opacity-100 max-lg:h-7 max-lg:w-7 max-lg:opacity-100"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              )}
            </span>
          );
        })}
        </div>
        {isAdmin && !addingType && (
          <button
            type="button"
            className="rounded-full border border-dashed border-[#d4d4d4] px-3 py-1.5 text-sm font-semibold text-[#171717] hover:bg-white"
            onClick={() => {
              setAddingType(true);
              setTypeError("");
            }}
          >
            + Add type
          </button>
        )}
        {isAdmin && addingType && (
          <span className="inline-flex items-center gap-2">
            <input
              autoFocus
              className="erp-input mt-0 w-56 py-1.5"
              placeholder="New product type"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addType();
                if (e.key === "Escape") closeAddType();
              }}
            />
            <button type="button" className="erp-btn mt-0" onClick={addTypeOnce} disabled={addTypeBusy}>{addTypeBusy ? "Adding…" : "Add"}</button>
            <button type="button" className="erp-btn erp-btn-secondary mt-0" onClick={closeAddType}>Cancel</button>
          </span>
        )}
      </div>
      {typeError && <p className="text-sm text-red-700">{typeError}</p>}

      <div className="erp-panel overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className="erp-input mt-0 w-56" placeholder="Search size or valve" value={query} onChange={(e) => setQuery(e.target.value)} />
            {isAdmin && (
              <button type="button" className="erp-btn mt-0" onClick={openAdd}>
                Add product
              </button>
            )}
            {msg && <span className="text-sm text-emerald-700">{msg}</span>}
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                {["Type", "Size", "Valve", "Bags", "Domestic pcs", "Export pcs", "KG", "ExKg", ""].map((h) => (
                  <th key={h || "edit"}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!ready && <SkeletonRows rows={8} cols={9} />}
              {ready && rows.length === 0 && (
                <tr>
                  <td colSpan={9}>No products in this list.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.category}</td>
                  <td className="font-semibold">{r.size}</td>
                  <td>{r.valve || "—"}</td>
                  <td>{bagsLabel(r)}</td>
                  <td>{r.domestic_qty}</td>
                  <td>{r.export_qty}</td>
                  <td>{formatKg(r.weight_kg ?? 0)}</td>
                  <td>{formatPct(r.ex_kg ?? 0)}</td>
                  <td>
                    {(isAdmin || canDelete) && (
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                        <button type="button" className="erp-btn erp-btn-secondary mt-0" onClick={() => openEdit(r)}>
                          Edit
                        </button>
                        )}
                        {canDelete && (
                        <button
                          type="button"
                          aria-label={`Delete ${r.size}`}
                          title="Delete product"
                          onClick={() => deleteProduct(r)}
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

      {(editing || adding) && (
        <ProductDialog
          isNew={adding}
          form={form}
          setForm={setForm}
          categories={categories}
          onCreateType={async (name) => (await createType(name)).name}
          finished={finished}
          store={store}
          busy={busy}
          error={formError}
          onClose={closeDialog}
          onSave={adding ? saveNew : saveEdit}
        />
      )}
    </div>
  );
}

function ProductDialog({
  isNew,
  form,
  setForm,
  categories,
  onCreateType,
  finished,
  store,
  busy,
  error,
  onClose,
  onSave,
}: {
  isNew: boolean;
  form: Form;
  setForm: (next: Form) => void;
  categories: string[];
  onCreateType: (name: string) => Promise<string>;
  finished: Inventory[];
  store: Inventory[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [tried, setTried] = useState(false);
  const [newType, setNewType] = useState<string | null>(null);
  const [typeBusy, setTypeBusy] = useState(false);
  const [typeError, setTypeError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const sizeKnown = finished.some((s) => s.name === form.size);
  const valveKnown = !form.valve || store.some((s) => s.name === form.valve);
  const problems = {
    category: !form.category ? "Choose a product type." : "",
    size: !form.size ? "Choose a size." : !sizeKnown ? "Pick a size from the list. Add it in Item Master first if it is missing." : "",
    valve: !valveKnown ? "Pick a valve from the list, or leave it empty." : "",
  };
  const invalid = Object.values(problems).some(Boolean);
  const piecesPerPack = form.bag_pcs * form.bags;

  function setPack(next: { bag_pcs?: number; bags?: number }) {
    const old = form.bag_pcs * form.bags;
    const bag_pcs = next.bag_pcs ?? form.bag_pcs;
    const bags = next.bags ?? form.bags;
    const total = bag_pcs * bags;
    // Domestic / export follow the pack size until they are changed by hand.
    setForm({
      ...form,
      bag_pcs,
      bags,
      domestic_qty: form.domestic_qty === old ? total : form.domestic_qty,
      export_qty: form.export_qty === old ? total : form.export_qty,
    });
  }

  async function addType() {
    const name = (newType ?? "").trim();
    if (!name) {
      setTypeError("Enter a type name.");
      return;
    }
    setTypeBusy(true);
    setTypeError("");
    try {
      const created = await onCreateType(name);
      setForm({ ...form, category: created });
      setNewType(null);
    } catch (e) {
      setTypeError(e instanceof ApiClientError ? e.message : "Could not add type");
    } finally {
      setTypeBusy(false);
    }
  }

  function submit() {
    setTried(true);
    if (!invalid) onSave();
  }

  const fieldError = (msg: string) => (tried && msg ? <span className="mt-1 block text-xs font-medium text-red-700">{msg}</span> : null);
  const ring = (msg: string) => (tried && msg ? "border-red-400 ring-2 ring-red-100" : "");
  const num = (v: number) => (Number.isFinite(v) ? v : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0a0a0a]/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "Add product" : "Edit product"} className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#e5e5e5] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#171717]">{isNew ? "Add product" : "Edit product"}</h2>
            <p className="mt-0.5 text-sm text-[#737373]">{isNew ? "Pick a type, then the size and pack details." : `${form.size || "Product"} · ${form.category || "No type"}`}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-[#737373] hover:bg-[#f5f5f5]">
            ×
          </button>
        </header>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#737373]">Product type <span className="text-red-600">*</span></h3>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Product type">
              {categories.map((c) => {
                const on = form.category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setForm({ ...form, category: c })}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${on ? "border-[#171717] bg-[#171717] text-white shadow-sm" : "border-[#e5e5e5] bg-white text-[#404040] hover:border-[#171717] hover:text-[#171717]"}`}
                  >
                    {on && <span className="mr-1">✓</span>}
                    {c}
                  </button>
                );
              })}
              {newType === null ? (
                <button type="button" onClick={() => { setNewType(""); setTypeError(""); }} className="rounded-full border border-dashed border-[#d4d4d4] px-3.5 py-1.5 text-sm font-semibold text-[#171717] hover:bg-[#fafafa]">
                  + New type
                </button>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <input
                    autoFocus
                    className="erp-input mt-0 w-52 py-1.5"
                    placeholder="e.g. Truck Radial"
                    value={newType}
                    maxLength={80}
                    onChange={(e) => setNewType(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addType(); }
                      if (e.key === "Escape") { e.stopPropagation(); setNewType(null); setTypeError(""); }
                    }}
                  />
                  <button type="button" className="erp-btn mt-0 py-1.5" onClick={addType} disabled={typeBusy}>{typeBusy ? "Adding…" : "Add"}</button>
                  <button type="button" className="erp-btn erp-btn-secondary mt-0 py-1.5" onClick={() => { setNewType(null); setTypeError(""); }}>Cancel</button>
                </span>
              )}
            </div>
            {typeError && <p className="mt-1.5 text-xs font-medium text-red-700">{typeError}</p>}
            {fieldError(problems.category)}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#737373]">Size and valve</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-[#404040]">
                Size <span className="text-red-600">*</span>
                <input
                  className={`erp-input ${ring(problems.size)}`}
                  list="product-sizes"
                  placeholder="Search or choose a size"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                />
                <datalist id="product-sizes">{finished.map((s) => <option key={s.id} value={s.name} />)}</datalist>
                {fieldError(problems.size)}
                <span className="mt-1 block text-xs font-normal text-[#737373]">From Finished Goods in Item Master.</span>
              </label>
              <label className="block text-sm font-semibold text-[#404040]">
                Valve
                <input
                  className={`erp-input ${ring(problems.valve)}`}
                  list="product-valves"
                  placeholder="Optional"
                  value={form.valve}
                  onChange={(e) => setForm({ ...form, valve: e.target.value })}
                />
                <datalist id="product-valves">{store.map((v) => <option key={v.id} value={v.name} />)}</datalist>
                {fieldError(problems.valve)}
                <span className="mt-1 block text-xs font-normal text-[#737373]">From Store Items in Item Master.</span>
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#737373]">Packing</h3>
            <div className="rounded-xl bg-[#fafafa] p-4">
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1.7fr_1fr_1fr]">
                <div className="rounded-xl border border-[#e5e5e5] bg-white p-3">
                  <span className="block text-sm font-semibold text-[#404040]">Small Bag Packing</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input aria-label="Pieces per small bag" className="erp-input mt-0 min-w-0" type="number" min={0} value={form.bag_pcs} onChange={(e) => setPack({ bag_pcs: Math.max(0, num(Number(e.target.value))) })} />
                    <span className="shrink-0 text-sm text-[#737373]">PCS ×</span>
                    <input aria-label="Number of small bags" className="erp-input mt-0 min-w-0" type="number" min={0} value={form.bags} onChange={(e) => setPack({ bags: Math.max(0, num(Number(e.target.value))) })} />
                    <span className="shrink-0 text-sm text-[#737373]">bags</span>
                  </div>
                </div>
                <label className="block rounded-xl border border-[#e5e5e5] bg-white p-3 text-sm font-semibold text-[#404040]">
                  Domestic pcs
                  <input className="erp-input" type="number" min={0} value={form.domestic_qty} onChange={(e) => setForm({ ...form, domestic_qty: Math.max(0, num(Number(e.target.value))) })} />
                </label>
                <label className="block rounded-xl border border-[#e5e5e5] bg-white p-3 text-sm font-semibold text-[#404040]">
                  Export pcs
                  <input className="erp-input" type="number" min={0} value={form.export_qty} onChange={(e) => setForm({ ...form, export_qty: Math.max(0, num(Number(e.target.value))) })} />
                </label>
              </div>
              {piecesPerPack > 0 && (form.domestic_qty !== piecesPerPack || form.export_qty !== piecesPerPack) && (
                <button type="button" className="mt-3 text-xs font-semibold text-[#171717] underline" onClick={() => setForm({ ...form, domestic_qty: piecesPerPack, export_qty: piecesPerPack })}>
                  Set domestic and export to {piecesPerPack} pcs
                </button>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#737373]">Weight</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-[#404040]">
                KG per piece
                <input className="erp-input" type="number" min={0} step="0.01" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: Math.max(0, num(Number(e.target.value))) })} />
              </label>
              <label className="block text-sm font-semibold text-[#404040]">
                ExKg %
                <input className="erp-input" type="number" min={0} step="0.01" value={form.ex_kg} onChange={(e) => setForm({ ...form, ex_kg: Math.max(0, num(Number(e.target.value))) })} />
                <span className="mt-1 block text-xs font-normal text-[#737373]">
                  {form.weight_kg > 0 ? `Extrusion allows up to ${(form.weight_kg * (1 + form.ex_kg / 100)).toFixed(3)} KG per piece.` : "Extrusion weight allowance."}
                </span>
              </label>
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e5e5] bg-[#fafafa] px-6 py-4">
          <p className={`text-sm font-medium ${error ? "text-red-700" : tried && invalid ? "text-red-700" : "text-[#737373]"}`} role="alert">
            {error || (tried && invalid ? "Fix the highlighted fields to continue." : "Fields marked * are required.")}
          </p>
          <div className="flex gap-2">
            <button type="button" className="erp-btn erp-btn-secondary mt-0" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="erp-btn mt-0 min-w-28" onClick={submit} disabled={busy}>{busy ? "Saving…" : isNew ? "Add product" : "Save changes"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
