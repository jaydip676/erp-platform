"use client";

import { DateInput } from "@/components/date-input";
import { Busy } from "@/components/spinner";
import { useDateAllowed, useDateLimits } from "@/components/entry-window";
import { useEffect, useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";
import { useSubmit } from "@/lib/use-submit";
import { Banner } from "@/components/banner";
import { useConfirm } from "@/components/confirm";
import { showDate, todayISO } from "@/lib/dates";
import { GREEN_TUBE_TRANSFERS, splitByShare } from "@/lib/erp/transfer-map";

type StockRow = { itemType: string; itemId: number; department: string; balance: number };
type Product = { id: number; size: string; valve_type: string };
type Transfer = { voucher_no: string; date: string; status: string; by: string; from_size: string; from_qty: number; to: { size: string; qty: number }[]; notes: string | null };
type Target = { key: number; size: string; qty: string };

const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function TransferClient({ canAdd = false, canDelete = false }: { canAdd?: boolean; canDelete?: boolean }) {
  const limits = useDateLimits();
  const dateOk = useDateAllowed();
  const confirm = useConfirm();
  const [sizes, setSizes] = useState<string[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [list, setList] = useState<Transfer[]>([]);
  const [date, setDate] = useState(todayISO());
  const [from, setFrom] = useState("");
  const [qty, setQty] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [auto, setAuto] = useState(true);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    api<StockRow[]>("/api/stock").then((r) => setStock(Array.isArray(r) ? r : [])).catch(() => setStock([]));
    api<Product[]>("/api/products").then((r) => setProducts(Array.isArray(r) ? r : [])).catch(() => setProducts([]));
    api<Transfer[]>("/api/stock-transfer").then(setList).catch(() => setList([]));
  };
  useEffect(() => {
    load();
    api<{ name: string; group: string }[]>("/api/masters/inventory?group=Finished%20Goods")
      .then((rows) => setSizes([...new Set((Array.isArray(rows) ? rows : []).map((r) => r.name).filter(Boolean))].sort(byNumber)))
      .catch(() => setSizes([]));
  }, []);

  // Green Tube PCS per size (green tubes have no valve).
  const green = useMemo(() => {
    const sizeOf = new Map(products.filter((p) => !p.valve_type).map((p) => [p.id, p.size]));
    const m = new Map<string, number>();
    for (const r of stock) {
      if (r.itemType !== "PRODUCT" || r.department !== "EXTRUSION") continue;
      const s = sizeOf.get(r.itemId);
      if (s && r.balance > 0) m.set(s, (m.get(s) ?? 0) + r.balance);
    }
    return m;
  }, [stock, products]);
  const sources = [...green.keys()].sort(byNumber);
  const available = green.get(from) ?? 0;
  const suggested = GREEN_TUBE_TRANSFERS[from] ?? [];

  // Fill the target sizes from the usual split whenever the source changes, or the PCS while untouched.
  const fill = (size: string, pcs: number) => {
    const s = GREEN_TUBE_TRANSFERS[size] ?? [];
    const split = splitByShare(pcs, s.map((x) => x.share));
    setTargets(s.length ? s.map((x, i) => ({ key: Date.now() + i, size: x.size, qty: pcs ? String(split[i]) : "" })) : [{ key: Date.now(), size: "", qty: pcs ? String(pcs) : "" }]);
    setAuto(true);
  };
  useEffect(() => {
    if (!from && sources.length) {
      const first = sources.find((s) => GREEN_TUBE_TRANSFERS[s]) ?? sources[0];
      setFrom(first);
      setQty(String(green.get(first) ?? ""));
      fill(first, green.get(first) ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.join("|"), from]);

  const chooseFrom = (size: string) => {
    setFrom(size);
    const pcs = green.get(size) ?? 0;
    setQty(pcs ? String(pcs) : "");
    fill(size, pcs);
  };
  const changeQty = (value: string) => {
    setQty(value);
    if (auto) {
      const pcs = Math.max(0, Math.floor(Number(value) || 0));
      const split = splitByShare(pcs, suggested.length === targets.length ? suggested.map((x) => x.share) : targets.map(() => 1));
      setTargets((cur) => cur.map((t, i) => ({ ...t, qty: pcs ? String(split[i]) : "" })));
    }
  };
  const update = (key: number, patch: Partial<Target>) => {
    setAuto(false);
    setTargets((cur) => cur.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  };

  const pcs = Math.floor(Number(qty) || 0);
  const filled = targets.filter((t) => t.size && Number(t.qty) > 0);
  const total = filled.reduce((s, t) => s + Math.floor(Number(t.qty)), 0);
  const issues: string[] = [];
  if (!from) issues.push("Choose the size to transfer from.");
  if (pcs <= 0) issues.push("Enter the PCS to transfer.");
  else if (pcs > available) issues.push(`Only ${available} PCS of ${from} are in Green Tube stock.`);
  if (filled.length === 0) issues.push("Choose at least one size to transfer to, with its PCS.");
  if (targets.some((t) => t.size === from)) issues.push("A size cannot be transferred to itself.");
  const chosen = targets.map((t) => t.size).filter(Boolean);
  if (new Set(chosen).size !== chosen.length) issues.push("Each size can be listed once.");
  if (pcs > 0 && filled.length > 0 && total !== pcs) issues.push(`The sizes add up to ${total} PCS, but ${pcs} PCS are being transferred. They must match.`);

  const missing = suggested.filter((s) => !sizes.includes(s.size)).map((s) => s.size);
  const unknown = filled.filter((t) => !sizes.includes(t.size)).map((t) => t.size);
  if (unknown.length) issues.push(`${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not in Item Master (Finished Goods). Add ${unknown.length === 1 ? "it" : "them"} there or choose another size.`);

  const [postOnce, posting] = useSubmit(post);
  async function post() {
    if (issues.length) return;
    try {
      const d = await api<{ voucher_no: string }>("/api/stock-transfer", {
        method: "POST",
        body: JSON.stringify({ date, from_size: from, from_qty: pcs, to: filled.map((t) => ({ size: t.size, qty: Math.floor(Number(t.qty)) })), notes: notes || undefined }),
      });
      setMsg({ ok: true, text: `${d.voucher_no} posted: ${pcs} PCS of ${from} moved to ${filled.map((t) => `${t.size} (${t.qty})`).join(", ")}.` });
      setNotes("");
      setFrom("");
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not post. Try again." });
    }
  }

  async function remove(no: string) {
    if (!(await confirm({ title: `Remove ${no}?`, body: "The PCS go back to the original size. This is refused if the new sizes were already used in the next step.", confirm: "Remove", danger: true }))) return;
    try {
      await api(`/api/stock-transfer?no=${encodeURIComponent(no)}`, { method: "DELETE" });
      setMsg({ ok: true, text: `${no} removed.` });
      setFrom("");
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not remove. Try again." });
    }
  }

  return (
    <div className="space-y-4">
      {canAdd ? (
      <div className="erp-panel">
        <h2 className="text-lg font-semibold">Stock Transfer</h2>
        <p className="erp-hint">Moves green tubes (after Step 1) from one size to one or more other sizes. The PCS taken out must equal the PCS added. Usual sizes are suggested first; any other size can be chosen.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="erp-label">
            Date
            <DateInput className="erp-input" {...limits} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="erp-label">
            Transfer from (size)
            <select className="erp-input" value={from} onChange={(e) => chooseFrom(e.target.value)}>
              {sources.length === 0 && <option value="">No green tubes in stock</option>}
              {sources.map((s) => (
                <option key={s} value={s}>{s} · {green.get(s)} PCS</option>
              ))}
            </select>
          </label>
          <label className="erp-label">
            PCS to transfer
            <input className="erp-input" type="number" min={1} step={1} value={qty} placeholder="0" onChange={(e) => changeQty(e.target.value)} />
            {from && <span className="mt-1 block text-xs font-normal text-[#737373]">{available} PCS of {from} available</span>}
          </label>
        </div>

        <div className="mt-4 text-sm font-semibold">Transfer to</div>
        <div className="mt-2 space-y-2">
          {targets.map((t) => (
            <div key={t.key} className="grid grid-cols-[1fr_9rem_2rem] items-center gap-2 md:max-w-xl">
              <select className="erp-input m-0" value={t.size} onChange={(e) => update(t.key, { size: e.target.value })}>
                <option value="">Choose size…</option>
                {suggested.length > 0 && (
                  <optgroup label={`Usual for ${from}`}>
                    {suggested.map((s) => (
                      <option key={s.size} value={s.size} disabled={!sizes.includes(s.size)}>
                        {s.size}{sizes.includes(s.size) ? "" : " (not in Item Master)"}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Other sizes">
                  {sizes.filter((s) => s !== from && !suggested.some((x) => x.size === s)).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </optgroup>
              </select>
              <input className="erp-input m-0 text-right" type="number" min={1} step={1} placeholder="PCS" value={t.qty} onChange={(e) => update(t.key, { qty: e.target.value })} />
              <button
                type="button"
                aria-label="Remove size"
                className="text-sm font-semibold text-[#a3a3a3] hover:text-rose-700 disabled:opacity-30"
                disabled={targets.length === 1}
                onClick={() => { setAuto(false); setTargets((cur) => cur.filter((x) => x.key !== t.key)); }}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="erp-btn erp-btn-secondary" onClick={() => { setAuto(false); setTargets((cur) => [...cur, { key: Date.now(), size: "", qty: "" }]); }}>
              + Add size
            </button>
            {suggested.length > 0 && (
              <button type="button" className="erp-btn erp-btn-secondary" onClick={() => fill(from, pcs)}>
                Use usual split
              </button>
            )}
          </div>
          {missing.length > 0 && <p className="text-xs font-semibold text-amber-700">{missing.join(", ")} {missing.length === 1 ? "is" : "are"} not in Item Master (Finished Goods). Add {missing.length === 1 ? "it" : "them"} there to use {missing.length === 1 ? "it" : "them"}.</p>}
        </div>

        <label className="erp-label mt-3 block md:max-w-xl">
          Remarks
          <input className="erp-input" value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
        </label>

        <div className="mt-4 rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">Will post</div>
          {pcs > 0 && from ? (
            <div className="mt-1 text-[#171717]">
              <b>{pcs}</b> PCS of <b>{from}</b> out → {filled.length ? filled.map((t, i) => <span key={t.key}>{i ? ", " : ""}<b>{t.size}</b> {t.qty} PCS</span>) : "—"}
            </div>
          ) : (
            <div className="mt-1 text-[#a3a3a3]">Choose a size and PCS to see the transfer.</div>
          )}
          {issues.length > 0 && pcs > 0 && <ul className="mt-1 list-disc pl-5 text-xs font-semibold text-rose-700">{issues.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
        {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}
        <div className="erp-sticky-bar lg:contents">
          <button type="button" className="erp-btn mt-3" onClick={postOnce} disabled={posting || issues.length > 0}>
            {posting ? <Busy>Posting…</Busy> : "Post transfer"}
          </button>
        </div>
      </div>
      ) : (
        <>
          <p className="erp-hint">You can view transfers only.</p>
          {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}
        </>
      )}

      <div className="erp-panel">
        <h3 className="text-base font-semibold">Recent transfers</h3>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Voucher</th>
                <th className="w-28">Date</th>
                <th>From</th>
                <th className="text-right">PCS</th>
                <th>To</th>
                <th>Remarks</th>
                {canDelete && <th className="w-20" />}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-[#a3a3a3]">No transfers yet.</td></tr>}
              {list.map((t) => {
                const voided = t.status === "VOID";
                return (
                  <tr key={t.voucher_no} className={voided ? "text-[#a3a3a3] line-through" : ""}>
                    <td className="whitespace-nowrap font-medium">{t.voucher_no}</td>
                    <td className="whitespace-nowrap">{showDate(t.date)}</td>
                    <td>{t.from_size}</td>
                    <td className="text-right tabular-nums">{t.from_qty}</td>
                    <td>{t.to.map((x) => `${x.size} (${x.qty})`).join(", ")}</td>
                    <td className="text-[#737373]">{t.notes}</td>
                    {canDelete && <td className="text-right">{!voided && dateOk(t.date) && <button type="button" className="text-sm font-semibold text-[#737373] no-underline hover:text-rose-700" onClick={() => remove(t.voucher_no)}>Remove</button>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
