"use client";

import { VoucherAdminActions } from "@/components/voucher-admin";
import { useDateAllowed, useDateLimits } from "@/components/entry-window";
import { useSubmit } from "@/lib/use-submit";
import { SkeletonRows } from "@/components/skeleton";
import { showDate, todayISO } from "@/lib/dates";
import { Banner } from "@/components/banner";
import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";
import { allowedConsumedKg, maxConsumedKg } from "@/lib/erp/extrusion-limit";
import { finalGroup } from "@/lib/erp/codes";

type Product = { id: number; size: string; valve_type: string; unit_weight_kg: number | null };
type Batch = { id: number; batch_no: string; available_kg: number };
type Wip = { balance: number | null; source_department: string; target_department: string; unit: string };
type Grade = { id: number; code: string; name: string };
type PackingRule = { quality_grade_id: number | null; quality_name: string; size: string; item_name: string; unit: string; cons_qty: number };
type SizeSpec = { weight_kg: number; ex_kg: number };
type Entry = { voucher_no: string; items: string; brand?: string; output: number; consumed_kg: number; rework_kg: number; final_weight_kg?: number | null; repair: number; second: number; scrap: number; notes: string | null; status: string };

const STEP_NAME = { extrusion: "Extrusion", curing: "Press", inspection: "Inspection", packing: "Packing" } as const;

const STAGES = [
  ["extrusion", "1. Final Batch to Extrusion"],
  ["curing", "2. Green tubes to Press"],
  ["inspection", "3. Inspection — to Quality Approved (Unpacked)"],
  ["packing", "4. Packing — to Finished Goods"],
] as const;

type StageId = (typeof STAGES)[number][0];

export function ProcessClient({ allowed = STAGES.map(([id]) => id) as StageId[], perms = [] }: { allowed?: StageId[]; perms?: string[] }) {
  const dateOk = useDateAllowed();
  const limits = useDateLimits();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stage, setStage] = useState<StageId>(allowed[0] ?? "extrusion");
  const [autoDeduct, setAutoDeduct] = useState(true);
  const [processDate, setProcessDate] = useState(() => todayISO());
  const [productId, setProductId] = useState<number | "">("");
  const [size, setSize] = useState("");
  const [sizes, setSizes] = useState<string[]>([]);
  const [valves, setValves] = useState<string[]>([]);
  const [valve, setValve] = useState("");
  const [sizeValves, setSizeValves] = useState<Record<string, string[]>>({});
  const [inputQty, setInputQty] = useState(0);
  const [outputQty, setOutputQty] = useState(0);
  const [consumedKg, setConsumedKg] = useState(0);
  const [revertKg, setRevertKg] = useState(0);
  const [specs, setSpecs] = useState<Record<string, SizeSpec>>({});
  const [repairQty, setRepairQty] = useState(0);
  const [secondQty, setSecondQty] = useState(0);
  const [scrapQty, setScrapQty] = useState(0);
  const [notes, setNotes] = useState("");
  const [wip, setWip] = useState<Wip | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [packingRules, setPackingRules] = useState<PackingRule[]>([]);
  const [gradeId, setGradeId] = useState<number | "">("");
  const [finalWeight, setFinalWeight] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [posted, setPosted] = useState(0);
  const [waiting, setWaiting] = useState<Record<string, number>>({});
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesReady, setEntriesReady] = useState(false);

  useEffect(() => {
    api<Product[]>("/api/products").then((p) => {
      setProducts(p);
      if (p.length) setProductId(p[0].id);
    });
    api<Batch[]>("/api/batches?type=FINAL").then((b) => {
      setBatches([...b].sort((x, y) => x.id - y.id));
    });
    api<Grade[]>("/api/masters/qualities").then((rows) => {
      setGrades(rows);
      if (rows.length) setGradeId(rows[0].id);
    }).catch(() => setGrades([]));
    api<PackingRule[]>("/api/masters/packing").then(setPackingRules).catch(() => setPackingRules([]));
    api<{ packing_auto_deduction: boolean }>("/api/settings").then((s) => setAutoDeduct(s.packing_auto_deduction)).catch(() => setAutoDeduct(true));
    api<{ size: string; valve?: string; weight_kg: number; ex_kg: number }[]>("/api/catalog")
      .then((rows) => {
        const bySize: Record<string, string[]> = {};
        for (const row of Array.isArray(rows) ? rows : []) {
          const v = (row.valve ?? "").trim();
          if (!row.size || !v) continue;
          (bySize[row.size] ??= []);
          if (!bySize[row.size].includes(v)) bySize[row.size].push(v);
        }
        setSizeValves(bySize);
        const next: Record<string, SizeSpec> = {};
        for (const row of Array.isArray(rows) ? rows : []) {
          if (!row.size || row.weight_kg <= 0 || next[row.size]) continue;
          next[row.size] = { weight_kg: row.weight_kg, ex_kg: row.ex_kg ?? 0 };
        }
        setSpecs(next);
      })
      .catch(() => setSpecs({}));
    api<{ name: string; group: string }[]>("/api/masters/inventory?group=Finished%20Goods")
      .then((rows) => {
        const names = (Array.isArray(rows) ? rows : []).map((row) => row.name).filter(Boolean).sort();
        setSizes(names);
        setSize((current) => current || names[0] || "");
      })
      .catch(() => setSizes([]));
    api<{ name: string }[]>("/api/masters/inventory?group=Store%20Item")
      .then((rows) => {
        const names = (Array.isArray(rows) ? rows : []).map((row) => row.name).filter(Boolean).sort();
        setValves(names);
        setValve((current) => current || names[0] || "");
      })
      .catch(() => setValves([]));
  }, []);

  // Valves offered for the chosen size come from the Product List; the first is picked for the user.
  const valveOptions = sizeValves[size]?.length ? sizeValves[size] : valves;
  useEffect(() => {
    if (!valveOptions.includes(valve)) setValve(valveOptions[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, valveOptions.join("|")]);

  useEffect(() => {
    if (stage === "extrusion" || (stage !== "curing" && !productId) || (stage === "curing" && !size)) {
      setWip(null);
      return;
    }
    const query = stage === "curing"
      ? `stage=curing&size=${encodeURIComponent(size)}`
      : `stage=${stage}&product_id=${productId}`;
    api<Wip>(`/api/wip?${query}`)
      .then((row) => {
        setWip(row);
        setInputQty(row.balance ?? 0);
      })
      .catch(() => setWip(null));
  }, [stage, productId, size]);

  // How much is waiting for each step (shown on the step tabs), and what was posted on the chosen date.
  useEffect(() => {
    api<Record<string, number>>("/api/wip?counts=1").then(setWaiting).catch(() => setWaiting({}));
  }, [posted]);
  useEffect(() => {
    if (!processDate) return;
    api<Entry[]>(`/api/vouchers?type=${stage.toUpperCase()}&from=${processDate}&to=${processDate}&limit=200`)
      .then((r) => { setEntries(r); setEntriesReady(true); })
      .catch(() => { setEntries([]); setEntriesReady(true); });
  }, [stage, processDate, posted]);

  // Inspection and packing only work on what the step before produced: size and valve with pieces waiting.
  const [ready, setReady] = useState<(Product & { balance: number })[]>([]);
  const chained = stage === "inspection" || stage === "packing";
  const stageProducts = chained ? ready : products;
  useEffect(() => {
    if (!chained) return;
    api<(Product & { balance: number })[]>(`/api/wip?stage=${stage}&list=1`)
      .then((rows) => {
        setReady(rows);
        setProductId((cur) => (rows.some((p) => p.id === Number(cur)) ? cur : rows[0]?.id ?? ""));
      })
      .catch(() => setReady([]));
  }, [stage, chained, posted]);

  const product = stage === "extrusion"
    ? products.find((p) => p.size === size && !p.valve_type) ?? products.find((p) => p.size === size)
    : products.find((p) => p.id === Number(productId));
  // Final batches are grouped by formula (FB-FINALV1-MB-MASTERV1 ...). One group is used at a time, oldest batch first.
  const [group, setGroup] = useState("");
  const groups = [...new Set(batches.map((b) => finalGroup(b.batch_no)))].map((name) => {
    const rows = batches.filter((b) => finalGroup(b.batch_no) === name);
    return { name, first: rows[0].batch_no, kg: Number(rows.reduce((sum, b) => sum + b.available_kg, 0).toFixed(4)) };
  });
  const current = groups.find((g) => g.name === group) ?? groups[0];
  const poolKg = current?.kg ?? 0;
  const batch = current ? { available_kg: poolKg } : undefined;
  const rejection = stage !== "inspection" ? 0 : repairQty + secondQty + scrapQty;
  // Inspection: the PCS entered are the OK tubes; the source loses OK + Repair + Second + Scrap.
  const good = outputQty;
  const usedQty = outputQty + rejection;
  const piece = specs[size];
  const maxKg = stage === "extrusion" && piece && outputQty > 0 ? maxConsumedKg(piece.weight_kg, outputQty, piece.ex_kg) : null;
  const estKg = product?.unit_weight_kg ? Number((good * product.unit_weight_kg).toFixed(3)) : null;
  const packingForSize = packingRules.filter((rule) => product && rule.size === product.size);
  const packingPreview = packingForSize.filter((rule) => rule.quality_grade_id == null || rule.quality_grade_id === Number(gradeId));

  const [postProcessOnce, postProcessBusy] = useSubmit(postProcess);
  async function postProcess() {
    try {
      const d = await api<{ voucher_no: string; good_qty: number; rejection_qty: number; target_department: string; packing_used?: { name: string; qty: number; unit: string }[]; auto_deduction?: boolean }>(
        `/api/process/${stage}`,
        {
          method: "POST",
          body: JSON.stringify({
            date: processDate,
            product_id: stage === "extrusion" || stage === "curing" ? undefined : Number(productId),
            size: stage === "extrusion" || stage === "curing" ? size : undefined,
            valve: stage === "curing" ? valve : undefined,
            batch_id: null,
            input_qty: stage === "extrusion" ? outputQty : inputQty,
            output_qty: outputQty,
            consumed_kg: stage === "extrusion" ? consumedKg : 0,
            revert_kg: stage === "extrusion" ? revertKg : 0,
            repair_qty: stage !== "inspection" ? 0 : repairQty,
            quality_grade_id: stage === "packing" && gradeId !== "" ? Number(gradeId) : null,
            final_weight_kg: stage === "packing" && Number(finalWeight) > 0 ? Number(finalWeight) : null,
            second_qty: stage !== "inspection" ? 0 : secondQty,
            scrap_qty: stage !== "inspection" ? 0 : scrapQty,
            final_group: stage === "extrusion" ? current?.name : undefined,
            notes,
          }),
        },
      );
      const used = (d.packing_used ?? []).map((line) => `${line.name} ${line.qty} ${line.unit}`).join(", ");
      const reverted = stage === "extrusion" && revertKg > 0 ? `. Reworked ${revertKg} KG back to the final batch` : "";
      const rej = d.rejection_qty ? `, ${d.rejection_qty} PCS rejected` : "";
      const off = stage === "packing" && d.auto_deduction === false ? ". Auto deduction is off, so no packing items were deducted" : "";
      setResult({ ok: true, text: `${d.voucher_no} posted: ${d.good_qty} PCS moved to ${d.target_department}${rej}${reverted}${used ? `. Deducted ${used}` : ""}${off}.` });
      setPosted((n) => n + 1);
      setNotes("");
      setFinalWeight("");
      setOutputQty(0);
      setRepairQty(0);
      setSecondQty(0);
      setScrapQty(0);
      setConsumedKg(0);
      setRevertKg(0);
      const fresh = await api<Batch[]>("/api/batches?type=FINAL");
      setBatches([...fresh].sort((x, y) => x.id - y.id));
    } catch (e) {
      setResult({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not post. Try again." });
    }
  }

  const stageInfo = STAGES.find(([id]) => id === stage)!;
  const unitOut = stage === "extrusion" ? "Green Tube PCS" : stage === "curing" ? "Pressed" : stage === "inspection" ? "Unpacked (OK tubes)" : "Finished Good";
  const subject = stage === "extrusion" || stage === "curing" ? [size, stage === "curing" ? valve : ""].filter(Boolean).join(" / ") : product ? [product.size, product.valve_type].filter(Boolean).join(" / ") : "";

  const canEdit = perms.includes(`process.${stage}.edit`);
  const canDelete = perms.includes(`process.${stage}.delete`);
  const showActions = canEdit || canDelete;

  if (allowed.length === 0) {
    return <div className="erp-panel text-sm text-[#737373]">You have no production step assigned. Ask an admin for access.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist">
        {STAGES.map(([id, label], i) => {
          if (!allowed.includes(id)) return null;
          const on = id === stage;
          const n = waiting[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setStage(id);
                setResult(null);
              }}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? "border-[#171717] bg-[#171717] text-white" : "border-[#e5e5e5] bg-white text-[#171717] hover:bg-[#fafafa]"}`}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${on ? "bg-white text-[#171717]" : "bg-[#f5f5f5] text-[#525252]"}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" title={label}>{STEP_NAME[id]}</span>
                <span className={`block text-xs ${on ? "text-white/70" : "text-[#737373]"}`}>
                  {n == null ? "…" : id === "extrusion" ? `${Number(n.toFixed(2)).toLocaleString("en-IN")} KG compound ready` : `${n.toLocaleString("en-IN")} PCS waiting`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

    {canEdit ? (
    <div className="erp-panel">
      <h2 className="mb-1 text-lg font-semibold">{stageInfo[1].replace(/^\d+\.\s*/, "")}</h2>
      <p className="erp-hint">
        {stage === "extrusion" && "Uses KG from the chosen final batch group (oldest batch first) and makes green tubes."}
        {stage === "curing" && "Moves green tubes to the press. Pick the valve fitted to this size."}
        {stage === "inspection" && "Checks pressed tubes. Repair, Second and Scrap do not move on to packing."}
        {stage === "packing" && "Packs inspected tubes into finished goods and deducts the packing materials."}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="erp-label">
          Date
          <input className="erp-input" type="date" value={processDate} onChange={(e) => setProcessDate(e.target.value)} />
        </label>
        {stage === "extrusion" && (
            <label className="erp-label">
              Final batch group
              <select className="erp-input" value={current?.name ?? ""} onChange={(e) => setGroup(e.target.value)}>
                {groups.length === 0 && <option value="">No ready final batch</option>}
                {groups.map((g) => (
                  <option key={g.name} value={g.name}>{g.name} · {g.kg} KG</option>
                ))}
              </select>
              {current && (
                <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-[#737373]">
                  Combined {current.kg} KG. Used oldest first, starting with {current.first}.
                </span>
              )}
            </label>
        )}
        {stage === "extrusion" || stage === "curing" ? (
          <label className="erp-label">
            Size
            <select className="erp-input" value={size} onChange={(e) => setSize(e.target.value)}>
              {sizes.length === 0 && <option value="">No sizes in Finished Goods</option>}
              {sizes.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="erp-label">
            Size / valve
            <select className="erp-input" value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
              {stageProducts.length === 0 && <option value="">{stage === "packing" ? "No inspected pieces waiting" : "No pressed pieces waiting"}</option>}
              {stageProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.valve_type ? `${p.size} / ${p.valve_type}` : p.size}
                  {chained && "balance" in p ? ` · ${(p as { balance: number }).balance} PCS` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {stage === "extrusion" && (
          <>
            <label className="erp-label">
              Actual KG consumed {batch ? `(available ${batch.available_kg})` : ""}
              <input
                className="erp-input"
                type="number"
                step="0.001"
                max={maxKg != null ? allowedConsumedKg(maxKg) : undefined}
                value={consumedKg || ""} placeholder="0"
                onChange={(e) => setConsumedKg(Number(e.target.value))}
              />
              {piece && outputQty > 0 && (
                <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-[#737373]">
                  {outputQty} PCS × {piece.weight_kg} KG + {piece.ex_kg}% ExKg = {maxKg?.toFixed(3)} KG
                </span>
              )}
              {size && !piece && (
                <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-amber-700">
                  Set the KG for this size on the product list.
                </span>
              )}
            </label>
          </>
        )}
        {stage === "curing" && (
          <>
            <label className="erp-label">
              Valve
              <select className="erp-input" value={valve} onChange={(e) => setValve(e.target.value)}>
                {valveOptions.length === 0 && <option value="">No valves for this size</option>}
                {valveOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="erp-label">
              Weight
              <input className="erp-input bg-[#f5f5f5]" readOnly value={piece ? `${piece.weight_kg} KG` : ""} placeholder="Set KG on the product list" />
            </label>
          </>
        )}
        {stage !== "extrusion" && (
          <label className="erp-label">
            {stage === "curing" ? "Available Green Tubes (PCS)" : stage === "packing" ? "Available Unpacked PCS" : stage === "inspection" ? "Available Pressed PCS" : `Available in ${wip?.source_department ?? "source"} (PCS)`}
            <input className="erp-input" type="number" value={inputQty} onChange={(e) => setInputQty(Number(e.target.value))} />
          </label>
        )}
        <label className="erp-label">
          {stage === "extrusion" ? "Green Tube PCS" : stage === "curing" ? "Pressed Qty" : stage === "inspection" ? "Unpacked PCS (OK Tubes)" : "Finished Good PCS"}
          <input className="erp-input" type="number" value={outputQty || ""} placeholder="0" onChange={(e) => setOutputQty(Number(e.target.value))} />
        </label>
        {stage === "packing" && (
          <label className="erp-label">
            Brand
            <select className="erp-input" value={gradeId} onChange={(e) => setGradeId(Number(e.target.value))}>
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>{grade.name}</option>
              ))}
            </select>
          </label>
        )}
        {stage === "packing" && (
          <label className="erp-label">
            Final Packing Weight (KG)
            <input className="erp-input" type="number" inputMode="decimal" step="0.001" min={0} value={finalWeight} placeholder="0" onChange={(e) => setFinalWeight(e.target.value)} />
          </label>
        )}
        {stage === "extrusion" ? (
          <label className="erp-label">
            Rework KG
            <input className="erp-input" type="number" step="0.001" min={0} value={revertKg || ""} placeholder="0" onChange={(e) => setRevertKg(Number(e.target.value))} />
            <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-[#737373]">This KG goes back to the final batch.</span>
          </label>
        ) : stage !== "inspection" ? null : (
          <label className="erp-label">
            Repair PCS
            <input className="erp-input" type="number" value={repairQty || ""} placeholder="0" onChange={(e) => setRepairQty(Number(e.target.value))} />
          </label>
        )}
        {stage === "inspection" && (
          <>
        <label className="erp-label">
          Second PCS
          <input className="erp-input" type="number" value={secondQty || ""} placeholder="0" onChange={(e) => setSecondQty(Number(e.target.value))} />
        </label>
        <label className="erp-label">
          Scrap PCS
          <input className="erp-input" type="number" value={scrapQty || ""} placeholder="0" onChange={(e) => setScrapQty(Number(e.target.value))} />
        </label>
          </>
        )}
        <label className="erp-label md:col-span-3">
          Remarks
          <input className="erp-input" value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {stage === "packing" && (
        <div className={`mt-3 rounded-xl p-3 text-sm ${autoDeduct ? "bg-[#fafafa] text-[#737373]" : "border border-amber-300 bg-amber-50 text-amber-900"}`}>
          <b>Auto deduction when this size is finished</b>
          {!autoDeduct && <p className="mt-1 font-semibold">Off. This entry will not deduct any packing items. An admin can turn it on under Masters → Auto Consumption Packing.</p>}
          {autoDeduct && packingPreview.length === 0 && <p className="mt-1">No consumption is set for this size. Add it under Masters → Auto Consumption Packing.</p>}
          {autoDeduct && packingPreview.length > 0 && (
            <ul className="mt-1 space-y-1">
              {packingPreview.map((rule) => (
                <li key={`${rule.item_name}-${rule.quality_grade_id ?? "all"}`}>
                  {rule.item_name}: {(rule.cons_qty * good).toFixed(4)} {rule.unit}
                  {rule.quality_name && <span className="text-[#a3a3a3]"> ({rule.quality_name})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-4 rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 text-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">Will post</div>
        {outputQty > 0 ? (
          <div className="mt-1 text-[#171717]">
            <b>{outputQty.toLocaleString("en-IN")}</b> {unitOut}{subject ? <> of <b>{subject}</b></> : null}
            {stage === "extrusion" && consumedKg > 0 && <> · uses <b>{consumedKg} KG</b> from {current?.name ?? "the final batch group"}</>}
            {stage === "extrusion" && revertKg > 0 && <> · <b>{revertKg} KG</b> rework back</>}
            {rejection > 0 && <> · <b>{rejection}</b> rejected (Repair {repairQty}, Second {secondQty}, Scrap {scrapQty})</>}
            {stage !== "extrusion" && <> · <b>{good.toLocaleString("en-IN")}</b> PCS move on</>}
            {stage === "inspection" && <> · <b>{usedQty.toLocaleString("en-IN")}</b> PCS taken from Available Pressed PCS</>}
            {estKg != null && <span className="text-[#737373]"> · about {estKg} KG</span>}
            {stage !== "extrusion" && usedQty > inputQty && <div className="mt-1 font-semibold text-rose-700">Only {inputQty} PCS are available{rejection > 0 ? `, but OK + Repair + Second + Scrap is ${usedQty}` : ""}.</div>}
          </div>
        ) : (
          <div className="mt-1 text-[#a3a3a3]">Enter the {unitOut} to see what will be posted.</div>
        )}
      </div>
      {result && <Banner ok={result.ok} onClose={() => setResult(null)}>{result.text}</Banner>}
      <div className="erp-sticky-bar lg:contents">
        {!dateOk(processDate) && limits.min && (
          <p className="mb-2 text-xs font-semibold text-rose-700">You can only post entries dated from {showDate(limits.min)} to today.</p>
        )}
        <button type="button" className="erp-btn" onClick={postProcessOnce} disabled={postProcessBusy || !dateOk(processDate)}>
          {postProcessBusy ? "Posting…" : "Post voucher"}
        </button>
      </div>
    </div>
    ) : (
      <div className="erp-panel">
        <h2 className="mb-1 text-lg font-semibold">{stageInfo[1].replace(/^\d+\.\s*/, "")}</h2>
        <p className="erp-hint">You can view this step only. Pick a date to see its entries.</p>
        <label className="erp-label max-w-xs">
          Date
          <input className="erp-input" type="date" value={processDate} onChange={(e) => setProcessDate(e.target.value)} />
        </label>
        {result && <Banner ok={result.ok} onClose={() => setResult(null)}>{result.text}</Banner>}
      </div>
    )}

      <div className="erp-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">Entries on {showDate(processDate)}</h3>
          <span className="text-xs text-[#737373]">{entries.filter((e) => e.status !== "VOID").length} posted · {entries.filter((e) => e.status !== "VOID").reduce((t, e) => t + e.output, 0).toLocaleString("en-IN")} PCS</span>
        </div>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Size / valve</th>
                {stage === "packing" && <th>Brand</th>}
                <th className="text-right">PCS</th>
                {stage === "packing" && <th className="text-right">Weight KG</th>}
                {stage === "extrusion" && <th className="text-right">KG used</th>}
                {stage === "extrusion" && <th className="text-right">Rework KG</th>}
                {stage === "inspection" && <th className="text-right">Repair</th>}
                {stage === "inspection" && <th className="text-right">Second</th>}
                {stage === "inspection" && <th className="text-right">Scrap</th>}
                <th>Remarks</th>
                {showActions && <th className="w-28" />}
              </tr>
            </thead>
            <tbody>
              {!entriesReady && <SkeletonRows rows={4} cols={5} />}
              {entriesReady && entries.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-[#a3a3a3]">Nothing posted for this step on {showDate(processDate)}.</td></tr>
              )}
              {entries.map((e) => (
                <tr key={e.voucher_no} className={e.status === "VOID" ? "text-[#a3a3a3] line-through" : ""}>
                  <td className="whitespace-nowrap font-medium">{e.voucher_no}</td>
                  <td>{e.items || "–"}</td>
                  {stage === "packing" && <td>{e.brand || "–"}</td>}
                  <td className="text-right tabular-nums">{e.output.toLocaleString("en-IN")}</td>
                  {stage === "packing" && <td className="text-right tabular-nums">{e.final_weight_kg ?? "–"}</td>}
                  {stage === "extrusion" && <td className="text-right tabular-nums">{e.consumed_kg}</td>}
                  {stage === "extrusion" && <td className="text-right tabular-nums">{e.rework_kg || "–"}</td>}
                  {stage === "inspection" && <td className="text-right tabular-nums">{e.repair || "–"}</td>}
                  {stage === "inspection" && <td className="text-right tabular-nums">{e.second || "–"}</td>}
                  {stage === "inspection" && <td className="text-right tabular-nums">{e.scrap || "–"}</td>}
                  <td className="text-[#737373]">{e.notes || ""}</td>
                  {showActions && (
                    <td className="text-right no-underline">
                      <VoucherAdminActions
                        canEdit={canEdit}
                        canDelete={canDelete}
                        v={{ ...e, type_code: stage.toUpperCase(), date: processDate, output: e.output }}
                        onResult={setResult}
                        onChanged={() => setPosted((n) => n + 1)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}