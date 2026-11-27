"use client";

import { Modal } from "@/components/modal";
import { AddButton } from "@/components/add-button";
import { Select } from "@/components/select";
import { DateInput } from "@/components/date-input";
import { Busy } from "@/components/spinner";
import { useDateLimits } from "@/components/entry-window";
import { VoucherAdminActions } from "@/components/voucher-admin";
import { Tabs } from "@/components/tabs";
import { todayISO } from "@/lib/dates";
import { useCallback, useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";
import { DataTable } from "@/components/data-table";
import { Banner } from "@/components/banner";
import { showDate } from "@/lib/dates";

type Tab = "RAW" | "STORE" | "POUCH";
type Item = { id: number; code: string; name: string; unit: string; stock: number };
type Receipt = { voucher_no: string; type_code: string; date: string; items: string; quantity: string; qty: number | null; notes: string | null; status: string };
type RawMaterial = { id: number; code: string; name: string; stock_kg: number };

const TABS: { id: Tab; label: string }[] = [
  { id: "RAW", label: "Raw Material" },
  { id: "STORE", label: "Store Material" },
  { id: "POUCH", label: "Pouch Material" },
];

const GROUP_OF: Record<Exclude<Tab, "RAW">, string> = { STORE: "Store Item", POUCH: "Pouch Item" };

const today = () => todayISO();

function qty(n: number) {
  return String(Number(n.toFixed(4)));
}

export function MaterialsClient({ allowed = ["RAW", "STORE", "POUCH"], admin = false, perms = [] }: { allowed?: Tab[]; admin?: boolean; perms?: string[] }) {
  const limits = useDateLimits();
  const [receiving, setReceiving] = useState(false);
  const [reference, setReference] = useState("");
  const [tab, setTab] = useState<Tab>(allowed[0] ?? "RAW");
  const [raw, setRaw] = useState<Item[]>([]);
  const [store, setStore] = useState<Item[]>([]);
  const [pouch, setPouch] = useState<Item[]>([]);
  const [itemId, setItemId] = useState<Record<Tab, number | "">>({ RAW: "", STORE: "", POUCH: "" });
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(today);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [itemsReady, setItemsReady] = useState(false);
  const [receiptsReady, setReceiptsReady] = useState(false);

  const load = useCallback(async () => {
    const [r, s, p] = await Promise.all([
      api<RawMaterial[]>("/api/materials"),
      api<Item[]>("/api/store-materials?group=Store%20Item"),
      api<Item[]>("/api/store-materials?group=Pouch%20Item").catch(() => [] as Item[]),
    ]);
    const rawItems = (Array.isArray(r) ? r : []).map((m) => ({ id: m.id, code: m.code, name: m.name, unit: "KG", stock: m.stock_kg }));
    const storeItems = Array.isArray(s) ? s : [];
    setRaw(rawItems);
    const pouchItems = Array.isArray(p) ? p : [];
    setStore(storeItems);
    setPouch(pouchItems);
    setItemsReady(true);
    setItemId((cur) => ({
      RAW: cur.RAW === "" || !rawItems.some((i) => i.id === cur.RAW) ? (rawItems[0]?.id ?? "") : cur.RAW,
      STORE: cur.STORE === "" || !storeItems.some((i) => i.id === cur.STORE) ? (storeItems[0]?.id ?? "") : cur.STORE,
      POUCH: cur.POUCH === "" || !pouchItems.some((i) => i.id === cur.POUCH) ? (pouchItems[0]?.id ?? "") : cur.POUCH,
    }));
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  // Recent receipts for the open tab. Store and Pouch share one voucher type, so they are told apart by item name.
  const loadReceipts = useCallback(async (t: Tab) => {
    const rows = await api<Receipt[]>(`/api/vouchers?type=${t === "RAW" ? "PURCHASE" : "STORE_PURCHASE"}&limit=200`).catch(() => [] as Receipt[]);
    setReceipts(rows);
    setReceiptsReady(true);
  }, []);
  useEffect(() => {
    setReceiptsReady(false);
    loadReceipts(tab);
  }, [tab, loadReceipts]);

  const right = (a: "add" | "edit" | "delete") => admin || perms.includes(`materials.${tab.toLowerCase()}.${a}`);
  const canAdd = right("add");
  const canEdit = right("edit");
  const canDelete = right("delete");

  const listFor = (t: Tab) => (t === "RAW" ? raw : t === "STORE" ? store : pouch);
  const items = listFor(tab);
  const selected = items.find((i) => i.id === itemId[tab]);
  const unit = selected?.unit ?? (tab === "RAW" ? "KG" : "");

  function switchTab(next: Tab) {
    setTab(next);
    setQuantity("");
    setMsg(null);
  }

  async function post() {
    const amount = Number(quantity);
    if (!selected) return setMsg({ ok: false, text: tab === "RAW" ? "Choose a Raw Material." : tab === "POUCH" ? "Choose a Pouch Material." : "Choose a Store Material." });
    if (!(amount > 0)) return setMsg({ ok: false, text: "Enter a quantity greater than zero." });
    setBusy(true);
    try {
      const d =
        tab === "RAW"
          ? await api<{ voucher_no: string }>("/api/purchase", {
              method: "POST",
              body: JSON.stringify({ material_id: selected.id, quantity_kg: amount, date, reference: reference.trim() || undefined }),
            })
          : await api<{ voucher_no: string }>("/api/store-materials", {
              method: "POST",
              body: JSON.stringify({ store_item_id: selected.id, quantity: amount, date, reference: reference.trim() || undefined }),
            });
      setMsg({ ok: true, text: `${d.voucher_no} saved: ${qty(amount)} ${unit} of ${selected.name}` });
      setQuantity("");
      setReference("");
      setReceiving(false);
      await Promise.all([load(), loadReceipts(tab)]);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  if (allowed.length === 0) return <div className="erp-panel text-sm text-[#737373]">You have no Inward Material tab assigned. Ask an admin for access.</div>;

  return (
    <>
      <Tabs className="mb-4" tabs={TABS.filter((t) => allowed.includes(t.id)).map((t) => ({ id: t.id, label: t.label, count: listFor(t.id).length }))} value={tab} onChange={switchTab} />

      {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      {canAdd && receiving && (
        <Modal title={`New ${tab === "RAW" ? "raw material" : tab === "POUCH" ? "pouch material" : "store material"} receipt`} onClose={() => setReceiving(false)} busy={busy} size="md">
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <label className="erp-label mt-0 sm:col-span-2">
              {tab === "RAW" ? "Raw Material" : tab === "POUCH" ? "Pouch Material" : "Store Material"}
              <Select
                className="erp-input"
                value={itemId[tab]}
                onChange={(e) => setItemId({ ...itemId, [tab]: Number(e.target.value) })}
              >
                {items.length === 0 && <option value="">{tab === "RAW" ? "No Raw Materials in Item Master" : `No items in the ${GROUP_OF[tab]} Group`}</option>}
                {items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
              {selected && <span className="mt-1 block text-xs font-normal text-[#737373]">In stock now: {qty(Number(listFor(tab).find((x) => x.id === selected.id)?.stock ?? 0))} {unit}</span>}
            </label>
            <label className="erp-label">
              Quantity {unit}
              <input
                className="erp-input"
                type="number"
                inputMode="decimal"
                autoFocus
                min={0}
                step={tab === "RAW" ? "0.001" : "any"}
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && post()}
              />
            </label>
            <label className="erp-label">
              Date
              <DateInput className="erp-input" {...limits} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="erp-label sm:col-span-2">
              Reference
              <input className="erp-input" placeholder="Optional, e.g. bill / challan no." value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#f0f0f0] pt-4 sm:flex-row sm:justify-end [&>button]:m-0">
            <button type="button" className="erp-btn erp-btn-secondary" onClick={() => setReceiving(false)} disabled={busy}>Cancel</button>
            <button type="button" className="erp-btn" onClick={post} disabled={busy}>
              {busy ? <Busy>Posting…</Busy> : "Post receipt"}
            </button>
          </div>
        </Modal>
      )}

      <div className="erp-panel">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">{tab === "RAW" ? "Raw Material Stock" : tab === "POUCH" ? "Pouch Material Stock" : "Store Material Stock"}</h2>
          {canAdd ? <AddButton label="New receipt" onClick={() => { setMsg(null); setReceiving(true); }} /> : <span className="text-xs text-[#a3a3a3]">View only</span>}
        </div>
        {tab === "RAW" ? (
          <DataTable loading={!itemsReady} head={["Code", "Material", "Stock KG"]} rows={raw.map((m) => [m.code, m.name, m.stock])} />
        ) : (
          <DataTable loading={!itemsReady} head={["Code", "Material", "Unit", "Stock"]} rows={items.map((m) => [m.code, m.name, m.unit, m.stock])} />
        )}
      </div>
      <div className="erp-panel mt-4">
        <h2 className="mb-1 text-lg font-semibold">Recent receipts</h2>
        <p className="erp-hint">The last receipts posted for {tab === "RAW" ? "raw materials" : tab === "POUCH" ? "pouch materials" : "store materials"}.</p>
        <DataTable
          head={canEdit || canDelete ? ["Voucher", "Date", "Item", "Quantity", "Status", ""] : ["Voucher", "Date", "Item", "Quantity", "Status"]}
          empty="No receipts yet."
          loading={!receiptsReady}
          rows={receipts
            .filter((v) => tab === "RAW" || items.some((i) => v.items.split(", ").includes(i.name)))
            .slice(0, 15)
            .map((v) => {
              const cells = [v.voucher_no, showDate(v.date), v.items, v.quantity, v.status === "VOID" ? "Deleted" : "Posted"];
              return canEdit || canDelete ? [...cells, <VoucherAdminActions key={v.voucher_no} v={v} canEdit={canEdit} canDelete={canDelete} onResult={setMsg} onChanged={() => Promise.all([load(), loadReceipts(tab)])} />] : cells;
            })}
        />
      </div>
    </>
  );
}
