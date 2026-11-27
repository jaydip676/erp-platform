"use client";

import { useState } from "react";
import { Banner } from "@/components/banner";
import { useConfirm } from "@/components/confirm";
import { ApiClientError, api } from "@/lib/client-api";
import { useDateAllowed, useDateLimits } from "@/components/entry-window";

/** What the edit box needs to know about a voucher (a row from /api/vouchers). */
export type EditTarget = {
  voucher_no: string;
  type_code: string;
  date: string;
  notes: string | null;
  status?: string;
  qty?: number | null;
  output?: number;
  repair?: number;
  second?: number;
  scrap?: number;
  consumed_kg?: number;
  rework_kg?: number;
  final_weight_kg?: number | null;
};

export type ActionResult = { ok: boolean; text: string };

const RECEIPTS = ["PURCHASE", "STORE_PURCHASE"];
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** Edit and Delete for one voucher, as far as the user has those rights. The server checks them again. */
export function VoucherAdminActions({
  v,
  onResult,
  onChanged,
  canEdit = true,
  canDelete = true,
}: {
  v: EditTarget;
  onResult?: (r: ActionResult) => void;
  onChanged: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const dateOk = useDateAllowed();
  // Outside the user's entry-days window nothing can be changed (the server refuses it too).
  if (v.status === "VOID" || !dateOk(v.date) || (!canEdit && !canDelete)) return null;

  async function remove() {
    const ok = await confirm({
      title: `Delete ${v.voucher_no}?`,
      body: "The stock it added or used is put back. This is refused if that stock has already been used.",
      confirm: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/vouchers?no=${encodeURIComponent(v.voucher_no)}`, { method: "DELETE" });
      onResult?.({ ok: true, text: `${v.voucher_no} deleted. The stock is back.` });
      onChanged();
    } catch (e) {
      onResult?.({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not delete. Try again." });
    }
  }

  return (
    <>
      <span className="inline-flex gap-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        {canEdit && <button type="button" className="text-sm font-semibold text-[#525252] hover:text-black" onClick={() => setEditing(true)}>Edit</button>}
        {canDelete && <button type="button" className="text-sm font-semibold text-[#737373] hover:text-rose-700" onClick={remove}>Delete</button>}
      </span>
      {editing && (
        <EditBox
          v={v}
          onClose={() => setEditing(false)}
          onSaved={(text) => {
            setEditing(false);
            onResult?.({ ok: true, text });
            onChanged();
          }}
        />
      )}
    </>
  );
}

function EditBox({ v, onClose, onSaved }: { v: EditTarget; onClose: () => void; onSaved: (text: string) => void }) {
  const type = v.type_code;
  const [date, setDate] = useState(v.date);
  const [notes, setNotes] = useState(v.notes ?? "");
  const [qty, setQty] = useState(String(v.qty ?? ""));
  const [output, setOutput] = useState(String(v.output ?? ""));
  const [repair, setRepair] = useState(String(v.repair ?? 0));
  const [second, setSecond] = useState(String(v.second ?? 0));
  const [scrap, setScrap] = useState(String(v.scrap ?? 0));
  const [kg, setKg] = useState(String(v.consumed_kg ?? ""));
  const [rework, setRework] = useState(String(v.rework_kg ?? 0));
  const [weight, setWeight] = useState(v.final_weight_kg == null ? "" : String(v.final_weight_kg));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const limits = useDateLimits();

  const isReceipt = RECEIPTS.includes(type);
  const isStep = ["EXTRUSION", "CURING", "INSPECTION", "PACKING"].includes(type);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const body: Record<string, unknown> = { voucher_no: v.voucher_no, date };
      if (notes !== (v.notes ?? "")) body.notes = notes;
      if (isReceipt) body.quantity = num(qty);
      if (isStep) {
        body.output_qty = num(output);
        if (type === "EXTRUSION") {
          body.consumed_kg = num(kg);
          body.revert_kg = num(rework) ?? 0;
        }
        if (type === "INSPECTION") {
          body.repair_qty = num(repair) ?? 0;
          body.second_qty = num(second) ?? 0;
          body.scrap_qty = num(scrap) ?? 0;
        }
        if (type === "PACKING") body.final_weight_kg = num(weight) ?? null;
      }
      const r = await api<{ voucher_no: string; replaced?: string }>("/api/vouchers", { method: "PATCH", body: JSON.stringify(body) });
      onSaved(r.replaced ? `${v.voucher_no} updated. It is now ${r.voucher_no}.` : `${v.voucher_no} updated.`);
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0a0a0a]/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onClick={(e) => e.stopPropagation()}>
      <form
        role="dialog"
        aria-modal="true"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6"
        onSubmit={(e) => { e.preventDefault(); save(); }}
      >
        <h2 className="text-base font-semibold text-[#0a0a0a]">Edit {v.voucher_no}</h2>
        <div className="mt-4 space-y-3">
          <label className="erp-label">Date<input className="erp-input" type="date" {...limits} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {isReceipt && <label className="erp-label">Quantity received<input className="erp-input" type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></label>}
          {type === "EXTRUSION" && (<>
            <label className="erp-label">Green Tube PCS<input className="erp-input" type="number" inputMode="numeric" min={1} step={1} value={output} onChange={(e) => setOutput(e.target.value)} /></label>
            <label className="erp-label">Actual KG consumed<input className="erp-input" type="number" inputMode="decimal" min={0} step="any" value={kg} onChange={(e) => setKg(e.target.value)} /></label>
            <label className="erp-label">Rework KG (back to the batch)<input className="erp-input" type="number" inputMode="decimal" min={0} step="any" value={rework} onChange={(e) => setRework(e.target.value)} /></label>
          </>)}
          {type === "CURING" && <label className="erp-label">Pressed Qty<input className="erp-input" type="number" inputMode="numeric" min={1} step={1} value={output} onChange={(e) => setOutput(e.target.value)} /></label>}
          {type === "INSPECTION" && (<>
            <label className="erp-label">Unpacked PCS (OK Tubes)<input className="erp-input" type="number" inputMode="numeric" min={1} step={1} value={output} onChange={(e) => setOutput(e.target.value)} /></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="erp-label">Repair<input className="erp-input" type="number" inputMode="numeric" min={0} step={1} value={repair} onChange={(e) => setRepair(e.target.value)} /></label>
              <label className="erp-label">Second<input className="erp-input" type="number" inputMode="numeric" min={0} step={1} value={second} onChange={(e) => setSecond(e.target.value)} /></label>
              <label className="erp-label">Scrap<input className="erp-input" type="number" inputMode="numeric" min={0} step={1} value={scrap} onChange={(e) => setScrap(e.target.value)} /></label>
            </div>
          </>)}
          {type === "PACKING" && (<>
            <label className="erp-label">Finished Good PCS<input className="erp-input" type="number" inputMode="numeric" min={1} step={1} value={output} onChange={(e) => setOutput(e.target.value)} /></label>
            <label className="erp-label">Final Packing Weight (KG)<input className="erp-input" type="number" inputMode="decimal" min={0} step="any" placeholder="Optional" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
          </>)}
          <label className="erp-label">Remarks<input className="erp-input" value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        {!isReceipt && !isStep && <p className="erp-hint mt-3">The quantities of this voucher are tied to the stock it moved. To change them, delete it and enter it again.</p>}
        {isStep && <p className="erp-hint mt-3">Saving replaces this entry with a new voucher number. Stock is checked again, so it is refused if it would go below zero.</p>}
        {err && <Banner ok={false}>{err}</Banner>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:m-0 [&>button]:w-full sm:[&>button]:w-auto">
          <button type="button" className="erp-btn erp-btn-secondary mt-0" onClick={onClose}>Cancel</button>
          <button type="submit" className="erp-btn mt-0" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}
