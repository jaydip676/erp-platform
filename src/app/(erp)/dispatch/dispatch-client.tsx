"use client";

import { Modal } from "@/components/modal";
import { IconAction } from "@/components/icon-action";
import { Select } from "@/components/select";
import { DateInput } from "@/components/date-input";
import { ScrollLock } from "@/lib/use-scroll-lock";
import { Busy } from "@/components/spinner";
import { useDateAllowed, useDateLimits } from "@/components/entry-window";
import { useEffect, useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";
import { useSubmit } from "@/lib/use-submit";
import { Banner } from "@/components/banner";
import { Tabs } from "@/components/tabs";
import { SkeletonRows } from "@/components/skeleton";
import { useConfirm } from "@/components/confirm";
import { showDate, todayISO } from "@/lib/dates";

type Client = { id: number; name: string; phone: string; city: string };
type FgOption = { product_id: number; size: string; valve: string; brand: string; balance: number };
type GroupOption = { group: string; kg: number; batches: number };
type RawOption = { item_id: number; name: string; unit: string; balance: number };
type StoreOption = RawOption & { group: string };
type Options = { fg: FgOption[]; master: GroupOption[]; final: GroupOption[]; raw: RawOption[]; store: StoreOption[] };
type History = { voucher_no: string; date: string; status: string; kinds: Kind[]; client: string; by: string; notes: string | null; lines: { item: string; qty: number; unit: string }[] };
type FgLine = { key: number; kind: "FG"; product_id: number; label: string; qty: number };
type BatchLine = { key: number; kind: "MASTER" | "FINAL"; group: string; label: string; kg: number };
type ItemLine = { key: number; kind: "RAW" | "STORE"; item_id: number; label: string; qty: number; unit: string; what: string };
type Line = FgLine | BatchLine | ItemLine;
const isItem = (l: Line): l is ItemLine => l.kind === "RAW" || l.kind === "STORE";
const isFg = (l: Line): l is FgLine => l.kind === "FG";
type Kind = "FG" | "MASTER" | "FINAL" | "RAW" | "STORE" | "POUCH";

const KINDS: { id: Kind; label: string }[] = [
  { id: "FG", label: "Finished Goods" },
  { id: "MASTER", label: "Master Batches" },
  { id: "FINAL", label: "Final Batches" },
  { id: "RAW", label: "Raw Material" },
  { id: "STORE", label: "Store Material" },
  { id: "POUCH", label: "Pouch Material" },
];
const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const fmt = (n: number) => Number(n.toFixed(3)).toLocaleString("en-IN");
const emptyOptions: Options = { fg: [], master: [], final: [], raw: [], store: [] };

export function DispatchClient({ perms = [] }: { perms?: string[] }) {
  const confirm = useConfirm();
  const limits = useDateLimits();
  const dateOk = useDateAllowed();
  // Each Dispatch section (Finished Goods, Master Batches, …) has its own View / Edit / Delete.
  const right = (k: Kind, a: "view" | "add" | "edit" | "delete") => perms.includes(`dispatch.${k.toLowerCase()}.${a}`);
  const viewKinds = KINDS.filter((k) => right(k.id, "view"));
  const editKinds = KINDS.filter((k) => right(k.id, "add"));
  const canPost = editKinds.length > 0;
  const canClients = perms.includes("dispatch.clients.add");
  const canRemove = (h: History) => h.status !== "VOID" && h.kinds.length > 0 && h.kinds.every((k) => right(k, "delete")) && dateOk(h.date);
  const anyRemove = KINDS.some((k) => right(k.id, "delete"));
  const [clients, setClients] = useState<Client[]>([]);
  const [options, setOptions] = useState<Options>(emptyOptions);
  const [history, setHistory] = useState<History[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("");
  const [date, setDate] = useState(todayISO());
  const [clientId, setClientId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picking, setPicking] = useState(false);

  // Line picker
  const [kind, setKind] = useState<Kind>(editKinds[0]?.id ?? "FG");
  const [size, setSize] = useState("");
  const [valve, setValve] = useState("");
  const [brand, setBrand] = useState("");
  const [group, setGroup] = useState("");
  const [itemPick, setItemPick] = useState("");
  const [amount, setAmount] = useState("");

  // New client
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", city: "" });
  const [clientErr, setClientErr] = useState("");
  const [savingClient, setSavingClient] = useState(false);
  const closeClient = () => { setAdding(false); setClientErr(""); };
  useEffect(() => {
    if (!adding) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeClient();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding]);

  const loadClients = () => api<Client[]>("/api/clients").then((r) => setClients(Array.isArray(r) ? r : [])).catch(() => setClients([]));
  const load = (client = filter) =>
    api<{ options: Options; history: History[] }>(`/api/dispatch${client ? `?client=${client}` : ""}`)
      .then((r) => { setOptions(r.options ?? emptyOptions); setHistory(r.history ?? []); })
      .catch(() => { setOptions(emptyOptions); setHistory([]); })
      .finally(() => setReady(true));
  useEffect(() => { loadClients(); load(""); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // What is left after the lines already added to this dispatch.
  const usedFg = (id: number) => lines.reduce((s, l) => (l.kind === "FG" && l.product_id === id ? s + l.qty : s), 0);
  const usedGroup = (k: Kind, g: string) => lines.reduce((s, l) => (l.kind === k && (l.kind === "MASTER" || l.kind === "FINAL") && l.group === g ? s + l.kg : s), 0);
  const usedItem = (k: "RAW" | "STORE", id: number) => lines.reduce((s, l) => ((l.kind === "RAW" || l.kind === "STORE") && l.kind === k && l.item_id === id ? s + l.qty : s), 0);

  const sizes = useMemo(() => [...new Set(options.fg.map((o) => o.size))].sort(byNumber), [options.fg]);
  const valves = useMemo(() => [...new Set(options.fg.filter((o) => o.size === size).map((o) => o.valve))], [options.fg, size]);
  const brands = useMemo(() => options.fg.filter((o) => o.size === size && o.valve === valve), [options.fg, size, valve]);
  const picked = brands.find((o) => o.brand === brand);
  const groupList = kind === "MASTER" ? options.master : options.final;
  const pickedGroup = groupList.find((g) => g.group === group);
  const isItemKind = kind === "RAW" || kind === "STORE" || kind === "POUCH";
  const itemList: RawOption[] = kind === "RAW" ? options.raw : options.store.filter((i) => (kind === "POUCH") === (i.group === "Pouch Item"));
  const itemKind: "RAW" | "STORE" = kind === "RAW" ? "RAW" : "STORE";
  const pickedItem = itemList.find((i) => String(i.item_id) === itemPick);

  const left = kind === "FG"
    ? (picked ? picked.balance - usedFg(picked.product_id) : 0)
    : isItemKind
      ? (pickedItem ? Number((pickedItem.balance - usedItem(itemKind, pickedItem.item_id)).toFixed(3)) : 0)
      : pickedGroup ? Number((pickedGroup.kg - usedGroup(kind, pickedGroup.group)).toFixed(3)) : 0;
  const unitLabel = kind === "FG" ? "PCS" : isItemKind ? (pickedItem?.unit ?? "") : "KG";
  const num = Number(amount);
  const amountOk = kind === "FG" ? Number.isInteger(num) && num > 0 : num > 0;
  const canAdd = amountOk && (kind === "FG" ? !!picked : isItemKind ? !!pickedItem : !!pickedGroup) && num <= left + 0.0005;

  const chooseKind = (k: Kind) => { setKind(k); setSize(""); setValve(""); setBrand(""); setGroup(""); setItemPick(""); setAmount(""); };
  const addLine = () => {
    if (!canAdd) return;
    if (kind === "FG" && picked) {
      setLines((cur) => [...cur, { key: Date.now(), kind: "FG", product_id: picked.product_id, label: [picked.size, picked.valve, picked.brand].filter(Boolean).join(" / "), qty: num }]);
    } else if (isItemKind && pickedItem) {
      setLines((cur) => [...cur, { key: Date.now(), kind: itemKind, item_id: pickedItem.item_id, label: pickedItem.name, qty: num, unit: pickedItem.unit, what: kind === "RAW" ? "Raw material" : kind === "POUCH" ? "Pouch material" : "Store material" }]);
    } else if ((kind === "MASTER" || kind === "FINAL") && pickedGroup) {
      setLines((cur) => [...cur, { key: Date.now(), kind, group: pickedGroup.group, label: pickedGroup.group, kg: num }]);
    }
    setAmount("");
  };

  const issues: string[] = [];
  if (!clientId) issues.push("Choose the client.");
  if (lines.length === 0) issues.push("Add at least one item.");

  const [postOnce, posting] = useSubmit(post);
  // Picker popup: adds the line and closes, so the list below shows what was added.
  function addAndClose() {
    if (!canAdd) return;
    addLine();
    setPicking(false);
  }

  async function post() {
    if (issues.length) return;
    const client = clients.find((c) => c.id === clientId);
    const ok = await confirm({
      title: `Dispatch to ${client?.name ?? "client"}?`,
      confirm: "Post dispatch",
      body: (
        <ul className="space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-4">
              <span>{l.label}</span>
              <span className="tabular-nums text-[#737373]">{isFg(l) ? `${fmt(l.qty)} PCS` : isItem(l) ? `${fmt(l.qty)} ${l.unit}` : `${fmt(l.kg)} KG`}</span>
            </li>
          ))}
        </ul>
      ),
    });
    if (!ok) return;
    try {
      const d = await api<{ voucher_no: string; client: string; pcs: number; kg: number }>("/api/dispatch", {
        method: "POST",
        body: JSON.stringify({
          date,
          client_id: Number(clientId),
          notes: notes || undefined,
          lines: lines.map((l) => (isFg(l) ? { kind: "FG", product_id: l.product_id, qty: l.qty } : isItem(l) ? { kind: l.kind, item_id: l.item_id, qty: l.qty } : { kind: l.kind, group: l.group, kg: l.kg })),
        }),
      });
      const parts = [d.pcs > 0 ? `${fmt(d.pcs)} PCS` : "", d.kg > 0 ? `${fmt(d.kg)} KG` : ""].filter(Boolean).join(" and ");
      setMsg({ ok: true, text: `${d.voucher_no} posted: ${parts} sent to ${d.client}.` });
      setLines([]); setNotes(""); setAmount("");
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not post. Try again." });
    }
  }

  async function remove(no: string) {
    if (!(await confirm({ title: `Remove ${no}?`, body: "The finished goods and batch KG go back into stock.", confirm: "Remove", danger: true }))) return;
    try {
      await api(`/api/dispatch?no=${encodeURIComponent(no)}`, { method: "DELETE" });
      setMsg({ ok: true, text: `${no} removed. The stock is back.` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not remove. Try again." });
    }
  }

  async function saveClient() {
    setSavingClient(true);
    setClientErr("");
    try {
      const c = await api<Client>("/api/clients", { method: "POST", body: JSON.stringify(draft) }, { quiet: true });
      setDraft({ name: "", phone: "", city: "" });
      setAdding(false);
      await loadClients();
      setClientId(c.id);
    } catch (e) {
      setClientErr(e instanceof ApiClientError ? e.message : "Could not add the client.");
    } finally {
      setSavingClient(false);
    }
  }

  return (
    <div className="space-y-4">
      {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      {canPost && (
        <div className="erp-panel">
          <h2 className="text-lg font-semibold">Dispatch</h2>
          <p className="erp-hint">Send finished goods, batches and inward materials to a client. Finished goods go out by size, valve and brand; master and final batches by group, oldest batch first; raw, store and pouch materials by item.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="erp-label">
              Date
              <DateInput className="erp-input" {...limits} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="erp-label">
              Client
              <Select className="erp-input" value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Select client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ""}</option>)}
              </Select>
              {canClients && !adding && (
                <button type="button" className="mt-1 text-left text-xs font-semibold text-[#525252] hover:text-black" onClick={() => setAdding(true)}>+ New client</button>
              )}
            </label>
            <label className="erp-label">
              Remarks
              <input className="erp-input" value={notes} placeholder="Optional, e.g. challan / vehicle no." onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>

          <div className="mt-5">
            <Tabs size="sm" tabs={editKinds.map((k) => ({ id: k.id, label: k.label }))} value={kind} onChange={(id) => chooseKind(id as Kind)} className="mb-3" />
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d4d4d4] bg-[#fafafa] px-4 py-3 text-sm font-semibold text-[#171717] hover:bg-[#f4f4f5]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              Add {(KINDS.find((k) => k.id === kind)?.label ?? "item").toLowerCase()}
            </button>
            {picking && (
              <Modal title={`Add ${(KINDS.find((k) => k.id === kind)?.label ?? "item").toLowerCase()}`} onClose={() => setPicking(false)} size="md">
                {kind === "FG" ? (
                  <div className="grid gap-x-3 sm:grid-cols-2">
                    <label className="erp-label">Size
                      <Select className="erp-input" value={size} onChange={(e) => { const s = e.target.value; setSize(s); setBrand(""); const v = [...new Set(options.fg.filter((o) => o.size === s).map((o) => o.valve))]; setValve(v.length === 1 ? v[0] : ""); setAmount(""); }}>
                        <option value="">{sizes.length ? "Select size" : "No finished goods in stock"}</option>
                        {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </label>
                    <label className="erp-label">Valve
                      <Select className="erp-input" value={valve} disabled={!size} onChange={(e) => { setValve(e.target.value); setBrand(""); }}>
                        <option value="">{size ? "Select valve" : "Select size first"}</option>
                        {valves.map((v) => <option key={v} value={v}>{v}</option>)}
                      </Select>
                    </label>
                    <label className="erp-label">Brand
                      <Select className="erp-input" value={brand} disabled={!valve} onChange={(e) => setBrand(e.target.value)}>
                        <option value="">{valve ? "Select brand" : "Select valve first"}</option>
                        {brands.map((o) => <option key={o.product_id} value={o.brand}>{o.brand || "No brand"} · {fmt(o.balance - usedFg(o.product_id))} PCS</option>)}
                      </Select>
                    </label>
                    <label className="erp-label">PCS
                      <input className="erp-input text-right" autoFocus={false} type="number" inputMode="numeric" min={1} step={1} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAndClose(); } }} />
                    </label>
                  </div>
                ) : isItemKind ? (
                  <div className="grid gap-x-3 sm:grid-cols-2">
                    <label className="erp-label">{kind === "RAW" ? "Raw material" : kind === "POUCH" ? "Pouch material" : "Store material"}
                      <Select className="erp-input" value={itemPick} onChange={(e) => { setItemPick(e.target.value); setAmount(""); }}>
                        <option value="">{itemList.length ? "Select item" : "Nothing in stock"}</option>
                        {itemList.map((i) => <option key={i.item_id} value={i.item_id}>{i.name} · {fmt(i.balance - usedItem(itemKind, i.item_id))} {i.unit}</option>)}
                      </Select>
                    </label>
                    <label className="erp-label">Quantity{pickedItem ? ` (${pickedItem.unit})` : ""}
                      <input className="erp-input text-right" autoFocus={false} type="number" inputMode="decimal" min={0} step="0.001" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAndClose(); } }} />
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-x-3 sm:grid-cols-2">
                    <label className="erp-label">{kind === "MASTER" ? "Master batch group" : "Final batch group"}
                      <Select className="erp-input" value={group} onChange={(e) => { setGroup(e.target.value); setAmount(""); }}>
                        <option value="">{groupList.length ? "Select group" : "No batches in stock"}</option>
                        {groupList.map((g) => <option key={g.group} value={g.group}>{g.group} · {fmt(g.kg - usedGroup(kind, g.group))} KG</option>)}
                      </Select>
                    </label>
                    <label className="erp-label">KG
                      <input className="erp-input text-right" autoFocus={false} type="number" inputMode="decimal" min={0} step="0.001" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAndClose(); } }} />
                    </label>
                  </div>
                )}
                {amount && !canAdd && (picked || pickedGroup || pickedItem) && (
                  <p className="mt-1 text-xs font-semibold text-rose-700">
                    {num > left + 0.0005 ? `Only ${fmt(left)} ${unitLabel} are available.` : kind === "FG" ? "Enter whole PCS." : "Enter the quantity."}
                  </p>
                )}
                <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#f0f0f0] pt-4 sm:flex-row sm:justify-end [&>button]:m-0">
                  <button type="button" className="erp-btn erp-btn-secondary" onClick={() => setPicking(false)}>Cancel</button>
                  <button type="button" className="erp-btn" disabled={!canAdd} onClick={addAndClose}>Add to dispatch</button>
                </div>
              </Modal>
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-[#e5e5e5]">
            <table className="erp-table m-0">
              <thead><tr><th>Item</th><th className="text-right lg:w-40">Quantity</th><th className="w-20" /></tr></thead>
              <tbody>
                {lines.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-[#a3a3a3]">Nothing added yet. Choose what to send, enter the quantity and press Add.</td></tr>}
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td className="font-medium">{l.label}<span className="block text-xs font-normal text-[#737373]">{isFg(l) ? "Finished goods" : isItem(l) ? l.what : l.kind === "MASTER" ? "Master batch" : "Final batch"}</span></td>
                    <td className="text-right tabular-nums">{isFg(l) ? `${fmt(l.qty)} PCS` : isItem(l) ? `${fmt(l.qty)} ${l.unit}` : `${fmt(l.kg)} KG`}</td>
                    <td className="text-right"><IconAction kind="delete" label="Remove" onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}
          <div className="erp-sticky-bar lg:contents">
            <button type="button" className="erp-btn mt-3" onClick={postOnce} disabled={posting || issues.length > 0}>{posting ? <Busy>Posting…</Busy> : "Post dispatch"}</button>
          </div>
          {issues.length > 0 && lines.length > 0 && <p className="mt-1 text-xs font-semibold text-rose-700">{issues.join(" ")}</p>}
        </div>
      )}


      <div className="erp-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-base font-semibold">Dispatches</h3>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select className="erp-input m-0 min-w-0 flex-1 sm:w-48 sm:flex-none" value={filter} onChange={(e) => { setFilter(e.target.value); load(e.target.value); }}>
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr><th>Voucher</th><th className="w-28">Date</th><th>Client</th><th>Sent</th><th>Remarks</th>{anyRemove && <th className="w-20" />}</tr>
            </thead>
            <tbody>
              {!ready && <SkeletonRows rows={4} cols={5} />}
              {ready && history.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#a3a3a3]">No dispatches yet.</td></tr>}
              {history.filter((h) => h.kinds.every((k) => viewKinds.some((v) => v.id === k))).map((h) => {
                const voided = h.status === "VOID";
                return (
                  <tr key={h.voucher_no} className={voided ? "text-[#a3a3a3] line-through" : ""}>
                    <td className="whitespace-nowrap font-medium">{h.voucher_no}</td>
                    <td className="whitespace-nowrap">{showDate(h.date)}</td>
                    <td>{h.client}</td>
                    <td>{h.lines.map((l) => `${l.item} (${fmt(l.qty)} ${l.unit})`).join(", ")}</td>
                    <td className="text-[#737373]">{h.notes}</td>
                    {anyRemove && <td className="text-right">{canRemove(h) && <IconAction kind="delete" label="Remove" onClick={() => remove(h.voucher_no)} />}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {adding && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0a0a0a]/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && closeClient()}>
          <ScrollLock />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-client-title"
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6"
            onSubmit={(e) => { e.preventDefault(); saveClient(); }}
          >
            <h2 id="new-client-title" className="text-base font-semibold text-[#0a0a0a]">New client</h2>
            <div className="mt-4 space-y-3">
              <label className="erp-label">Client name<input className="erp-input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label className="erp-label">Phone<input className="erp-input" inputMode="tel" value={draft.phone} placeholder="Optional" onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
              <label className="erp-label">City<input className="erp-input" value={draft.city} placeholder="Optional" onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></label>
            </div>
            {clientErr && <Banner ok={false}>{clientErr}</Banner>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:m-0 [&>button]:w-full sm:[&>button]:w-auto">
              <button type="button" className="erp-btn erp-btn-secondary mt-0" onClick={closeClient}>Cancel</button>
              <button type="submit" className="erp-btn mt-0" disabled={!draft.name.trim() || savingClient}>{savingClient ? <Busy>Adding…</Busy> : "Add client"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
