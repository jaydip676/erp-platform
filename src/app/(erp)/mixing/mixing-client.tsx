"use client";

import { useDateAllowed, useDateLimits } from "@/components/entry-window";
import { Tabs } from "@/components/tabs";
import { SkeletonRows } from "@/components/skeleton";
import { useConfirm } from "@/components/confirm";
import { todayISO } from "@/lib/dates";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";
import { drawInOrder, finalGroup, masterGroup } from "@/lib/erp/codes";

type Material = { id: number; code: string; name: string; stock_kg: number };
type Batch = { id: number; batch_no: string; available_kg: number; total_kg: number; date?: string; from?: string | null };

const showDate = (iso?: string) => (iso ? iso.split("-").reverse().join("-") : "—");
type Line = { material_id: number; kg: string };
type Formula = {
  id: number;
  code: string;
  name: string | null;
  batch_type: string;
  total_kg: number;
  master_kg?: number;
  items: { material_id: number; name: string; kg: number }[];
};

const kgText = (n: number) => Number(n.toFixed(4)).toLocaleString("en-IN", { maximumFractionDigits: 4 });

/** Checks every material line. Stock is compared against the combined KG when a material repeats. */
function checkLines(lines: Line[], materials: Material[], allowBlank: boolean, times = 1) {
  const totals = new Map<number, number>();
  for (const l of lines) {
    const kg = Number(l.kg);
    if (l.kg.trim() !== "" && kg > 0) totals.set(l.material_id, (totals.get(l.material_id) ?? 0) + kg * times);
  }
  const errors = lines.map((l) => {
    const m = materials.find((x) => x.id === l.material_id);
    if (!m) return "Choose a material.";
    const blank = l.kg.trim() === "";
    if (blank) return allowBlank ? "" : "Enter the KG.";
    const kg = Number(l.kg);
    if (!Number.isFinite(kg) || kg <= 0) return "KG must be more than 0.";
    const total = totals.get(l.material_id) ?? 0;
    if (total > m.stock_kg + 0.0005) return `Short by ${kgText(total - m.stock_kg)} KG`;
    return "";
  });
  const used = lines.filter((l) => l.kg.trim() !== "" && Number(l.kg) > 0).length;
  const short = errors.filter((e) => e.startsWith("Short")).length;
  return { errors, used, short, bad: errors.filter(Boolean).length - short };
}

const TRASH = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);

function LinesTable({
  lines,
  setLines,
  materials,
  errors,
  kgLabel,
  minLines,
  locked = false,
  times,
}: {
  lines: Line[];
  setLines: (next: Line[]) => void;
  materials: Material[];
  errors: string[];
  kgLabel: string;
  minLines: number;
  /** Formula lines: the material and KG are fixed, and lines cannot be removed. */
  locked?: boolean;
  /** Number of batches. When set, a column shows the KG consumed for all of them. */
  times?: number;
}) {
  if (lines.length === 0) return null;
  const patch = (i: number, p: Partial<Line>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-[#e5e5e5]">
      {/* On phones the cells are tighter, headers wrap and the status sits under the material, so nothing scrolls sideways. */}
      <table className="erp-table m-0 max-sm:[&_td]:px-2 max-sm:[&_th]:px-2 max-sm:[&_th]:whitespace-normal">
        <thead>
          <tr>
            <th>Material</th>
            <th className="sm:w-28">{kgLabel}</th>
            {times !== undefined && <th className="text-right sm:w-36">Consumed KG{times > 1 ? ` (×${times})` : ""}</th>}
            <th className="text-right sm:w-28">In stock</th>
            <th className="hidden w-40 pl-6 sm:table-cell">Status</th>
            {!locked && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const m = materials.find((x) => x.id === line.material_id);
            const err = errors[i];
            const has = line.kg.trim() !== "";
            return (
              <tr key={i}>
                <td className={locked ? "font-semibold text-[#404040]" : ""}>
                  {locked ? (
                    m?.name ?? "—"
                  ) : (
                    <select className="erp-input" value={line.material_id} onChange={(e) => patch(i, { material_id: Number(e.target.value) })}>
                      {materials.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  )}
                  <div className="mt-0.5 text-[11px] font-semibold sm:hidden">
                    {err ? <span className="text-red-700">{err}</span> : has ? <span className="text-emerald-700">✓ In stock</span> : null}
                  </div>
                </td>
                <td className={locked ? "tabular-nums font-semibold text-[#404040]" : "min-w-[5.5rem]"}>
                  {locked ? (
                    kgText(Number(line.kg) || 0)
                  ) : (
                    <input
                      className={`erp-input ${err && has ? "border-red-400" : ""}`}
                      type="number"
                      min={0}
                      step="0.001"
                      value={line.kg}
                      onChange={(e) => patch(i, { kg: e.target.value })}
                    />
                  )}
                </td>
                {times !== undefined && (
                  <td className="text-right tabular-nums font-semibold text-[#171717]">{has && Number(line.kg) > 0 ? kgText(Number(line.kg) * times) : "—"}</td>
                )}
                <td className="text-right tabular-nums text-[#737373]">{m ? kgText(m.stock_kg) : "—"}</td>
                <td className="hidden pl-6 text-xs font-semibold sm:table-cell">
                  {err ? <span className="text-red-700">{err}</span> : has ? <span className="text-emerald-700">✓ In stock</span> : <span className="text-[#a3a3a3]">—</span>}
                </td>
                {!locked && (
                <td>
                  <button
                    type="button"
                    aria-label="Remove line"
                    title="Remove line"
                    disabled={lines.length <= minLines}
                    onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                    className="grid h-8 w-8 place-items-center rounded-md text-[#dc2626] hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {TRASH}
                  </button>
                </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MixingClient({ allowed = ["master", "final"], perms = [] }: { allowed?: ("master" | "final")[]; perms?: string[] }) {
  const limits = useDateLimits();
  const dateOk = useDateAllowed();
  const may = (t: "master" | "final", a: "edit" | "delete") => perms.includes(`mixing.${t}.${a}`);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [masters, setMasters] = useState<Batch[]>([]);
  const [ready, setReady] = useState(false);
  const [finals, setFinals] = useState<Batch[]>([]);
  const [allMasters, setAllMasters] = useState<Batch[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [formulaId, setFormulaId] = useState<number | "">("");
  const [masterLines, setMasterLines] = useState<Line[]>([]);
  const [finalLines, setFinalLines] = useState<Line[]>([]);
  const [finalFormulas, setFinalFormulas] = useState<Formula[]>([]);
  const [finalFormulaId, setFinalFormulaId] = useState<number | "">("");
  const [masterDate, setMasterDate] = useState(() => todayISO());
  const [finalDate, setFinalDate] = useState(() => todayISO());
  const [masterGrp, setMasterGrp] = useState("");
  const [finalQty, setFinalQty] = useState("1");
  const [finalCreating, setFinalCreating] = useState<{ done: number; total: number } | null>(null);
  const [finalMade, setFinalMade] = useState<{ batch_no: string; total_kg: number; from: string }[]>([]);
  const [tab, setTab] = useState<"master" | "final">(allowed[0] ?? "master");
  const [listMsg, setListMsg] = useState("");
  const [batchQty, setBatchQty] = useState("1");
  const [creating, setCreating] = useState<{ done: number; total: number } | null>(null);
  const [newBatches, setNewBatches] = useState<string[]>([]);
  const [masterResult, setMasterResult] = useState("");
  const [finalResult, setFinalResult] = useState("");

  function linesFromFormula(f: Formula): Line[] {
    return f.items.map((i) => ({ material_id: i.material_id, kg: String(Number(i.kg.toFixed(4))) }));
  }

  function pickFormula(id: number | "", list = formulas) {
    setFormulaId(id);
    const f = list.find((x) => x.id === id);
    if (f) setMasterLines(linesFromFormula(f));
  }

  async function reload() {
    const [m, b, fin, allM, recipes] = await Promise.all([
      api<Material[]>("/api/materials"),
      api<Batch[]>("/api/batches?type=MASTER"),
      api<Batch[]>("/api/batches?type=FINAL&all=1").catch(() => [] as Batch[]),
      api<Batch[]>("/api/batches?type=MASTER&all=1").catch(() => [] as Batch[]),
      api<Formula[]>("/api/masters/batches").catch(() => [] as Formula[]),
    ]);
    const masterFormulas = (Array.isArray(recipes) ? recipes : []).filter((f) => f.batch_type === "MASTER");
    setFormulas(masterFormulas);
    const finals = (Array.isArray(recipes) ? recipes : []).filter((f) => f.batch_type === "FINAL");
    setFinalFormulas(finals);
    setFinalFormulaId((id) => {
      if (id !== "" || finals.length === 0) return id;
      setFinalLines(linesFromFormula(finals[0]));
      return finals[0].id;
    });
    setMaterials(m);
    setMasters(b);
    setFinals(Array.isArray(fin) ? fin : []);
    setAllMasters(Array.isArray(allM) ? allM : []);
    setMasterLines((lines) => {
      if (lines.length) return lines;
      if (masterFormulas[0]) {
        setFormulaId(masterFormulas[0].id);
        return linesFromFormula(masterFormulas[0]);
      }
      return m[0] ? [{ material_id: m[0].id, kg: "" }] : [];
    });
    setMasterGrp((g) => g || (b.length ? masterGroup(b[b.length - 1].batch_no) : ""));
    setReady(true);
  }

  useEffect(() => {
    reload().catch(() => setReady(true));
  }, []);

  // Master batches grouped by formula (MB-V2). Each group's batches are used oldest first.
  const groups = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (const b of [...masters].sort((x, y) => x.id - y.id)) {
      const key = masterGroup(b.batch_no);
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()].map(([group, batches]) => ({
      group,
      batches,
      available_kg: batches.reduce((sum, b) => sum + b.available_kg, 0),
    }));
  }, [masters]);
  const selected = groups.find((g) => g.group === masterGrp);

  // Final formula "FINAL V2" belongs with master group "MB-MASTERV2": match them on the V-number.
  const versionOf = (text: string) => /V\s*(\d+)\s*$/i.exec(text.trim())?.[1] ?? null;
  const finalFormula = finalFormulas.find((f) => f.id === finalFormulaId);
  const finalVersion = finalFormula ? versionOf(finalFormula.name || finalFormula.code) : null;
  const groupVersion = selected ? versionOf(selected.group) : null;
  const mismatch = finalVersion && groupVersion && finalVersion !== groupVersion
    ? `${finalFormula?.name || finalFormula?.code} is usually made from V${finalVersion} master batches, but ${selected?.group} is selected.`
    : "";
  // On first load, line the master group up with the default final formula.
  const autoMatched = useRef(false);
  useEffect(() => {
    if (autoMatched.current || !finalVersion || groups.length === 0) return;
    autoMatched.current = true;
    const match = groups.find((g) => versionOf(g.group) === finalVersion);
    if (match) setMasterGrp(match.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalVersion, groups.length]);

  async function createMaster() {
    if (masterIssues.length || creating) return;
    const count = Math.floor(Number(batchQty));
    const items = masterLines.map((l) => ({ material_id: l.material_id, kg: Number(l.kg) })).filter((l) => l.kg > 0);
    setNewBatches([]);
    setMasterResult("");
    let made = 0;
    try {
      // One batch at a time, so each gets its own number and its own stock check.
      for (let i = 0; i < count; i++) {
        setCreating({ done: i, total: count });
        const d = await api<{ batch_no: string; total_kg: number }>("/api/master-batch", {
          method: "POST",
          body: JSON.stringify({ date: masterDate, formula_id: formulaId === "" ? null : formulaId, items }),
        });
        made += 1;
        setNewBatches((list) => [...list, d.batch_no]);
        await reload();
      }
      setMasterResult(`${made} master batch${made === 1 ? "" : "es"} ready`);
    } catch (e) {
      const why = e instanceof ApiClientError ? e.message : "Failed";
      setMasterResult(made > 0 ? `${made} of ${count} created. Stopped: ${why}` : why);
    } finally {
      setCreating(null);
    }
  }

  const confirm = useConfirm();
  async function removeMaster(b: Batch) {
    if (!(await confirm({ title: `Delete ${b.batch_no}?`, body: `Its ${kgText(b.total_kg)} KG leaves stock and the raw materials go back to stock.` }))) return;
    try {
      await api(`/api/master-batch/${b.id}`, { method: "DELETE" });
      setListMsg(`${b.batch_no} deleted`);
      await reload();
    } catch (e) {
      setListMsg(e instanceof ApiClientError ? e.message : "Could not delete");
    }
  }

  async function removeFinal(b: Batch) {
    if (!(await confirm({ title: `Delete ${b.batch_no}?`, body: "The master batches it used get their KG back and its extra materials return to stock." }))) return;
    try {
      await api(`/api/final-batch/${b.id}`, { method: "DELETE" });
      setFinalResult(`${b.batch_no} deleted`);
      await reload();
    } catch (e) {
      setFinalResult(e instanceof ApiClientError ? e.message : "Could not delete");
    }
  }

  async function createFinal() {
    if (finalIssues.length || finalCreating) return;
    const count = Math.floor(Number(finalQty));
    const extras = finalLines.map((l) => ({ material_id: l.material_id, kg: Number(l.kg) })).filter((l) => l.kg > 0);
    setFinalMade([]);
    setFinalResult("");
    let made = 0;
    try {
      // One batch at a time: each takes its master KG from the oldest batch first and its own extras.
      for (let i = 0; i < count; i++) {
        setFinalCreating({ done: i, total: count });
        const d = await api<{ batch_no: string; total_kg: number; parent_batch: string }>("/api/final-batch", {
          method: "POST",
          body: JSON.stringify({ date: finalDate, master_group: masterGrp, master_kg: Number(masterKg), formula_id: finalFormulaId === "" ? null : finalFormulaId, additional_items: extras }),
        });
        made += 1;
        setFinalMade((list) => [...list, { batch_no: d.batch_no, total_kg: d.total_kg, from: d.parent_batch }]);
        await reload();
      }
      setFinalResult(`${made} final batch${made === 1 ? "" : "es"} ready`);
    } catch (e) {
      const why = e instanceof ApiClientError ? e.message : "Failed";
      setFinalResult(made > 0 ? `${made} of ${count} created. Stopped: ${why}` : why);
    } finally {
      setFinalCreating(null);
    }
  }

  const qtyNum = Number(batchQty);
  const qtyOk = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= 50;
  const masterCheck = checkLines(masterLines, materials, false, qtyOk ? qtyNum : 1);
  const masterIssues: string[] = [];
  if (masterLines.length === 0 || masterCheck.used === 0) masterIssues.push("Add at least one material with KG.");
  if (masterCheck.short > 0) masterIssues.push(`${masterCheck.short} material${masterCheck.short === 1 ? " is" : "s are"} short on stock. Receive stock in Inward Material first.`);
  if (masterCheck.bad > 0) masterIssues.push(`Fix ${masterCheck.bad} highlighted line${masterCheck.bad === 1 ? "" : "s"}.`);
  if (!masterDate) masterIssues.push("Choose the mixing date.");
  if (!qtyOk) masterIssues.push("No. of Batch must be a whole number from 1 to 50.");

  const fqNum = Number(finalQty);
  const fqOk = Number.isInteger(fqNum) && fqNum >= 1 && fqNum <= 50;
  const finalTimes = fqOk ? fqNum : 1;
  const finalExtra = finalLines.reduce((sum, l) => sum + (Number(l.kg) > 0 ? Number(l.kg) : 0), 0);
  const finalCheck = checkLines(finalLines, materials, true, finalTimes);
  const finalIssues: string[] = [];
  // The master KG per batch is set on the final formula in Batch Master (60 when no formula is chosen).
  const masterKgNum = finalFormulas.find((f) => f.id === finalFormulaId)?.master_kg ?? 60;
  const masterKg = String(masterKgNum);
  if (!selected) finalIssues.push("Choose a ready master batch group.");
  if (masterKg.trim() === "" || !(masterKgNum > 0)) finalIssues.push("Enter the final KG per batch.");
  else if (selected && masterKgNum * finalTimes > selected.available_kg + 0.0005) finalIssues.push(`${finalTimes} batch${finalTimes === 1 ? "" : "es"} need ${kgText(masterKgNum * finalTimes)} KG but only ${kgText(selected.available_kg)} KG is left in ${selected.group}.`);
  if (!fqOk) finalIssues.push("No. of Batch must be a whole number from 1 to 50.");
  if (finalCheck.short > 0) finalIssues.push(`${finalCheck.short} additional material${finalCheck.short === 1 ? " is" : "s are"} short on stock.`);
  if (finalCheck.bad > 0) finalIssues.push(`Fix ${finalCheck.bad} highlighted line${finalCheck.bad === 1 ? "" : "s"}.`);
  if (!finalDate) finalIssues.push("Choose the date.");

  if (allowed.length === 0) return <div className="erp-panel text-sm text-[#737373]">You have no Mixing tab assigned. Ask an admin for access.</div>;

  return (
    <div className="erp-compact">
      <Tabs
        className="mb-4"
        tabs={([{ id: "master", label: "Master Batch" }, { id: "final", label: "Final Batch" }] as const).filter((t) => allowed.includes(t.id)).map((t) => ({ ...t }))}
        value={tab}
        onChange={setTab}
      />

      {tab === "master" && (
      <>
      {may("master", "edit") ? (
      <div className="erp-panel mb-4">
        <h2 className="text-lg font-semibold">Master Batch</h2>
        <p className="erp-hint">Pick a formula and its materials fill in, or choose Manual. Each of the No. of Batch gets its own batch number.</p>
        <div className="flex flex-wrap items-end gap-3">
        <label className="erp-label m-0 min-w-[240px] flex-1">
          Master batch formula
          <select
            className="erp-input"
            value={formulaId}
            onChange={(e) => {
              if (e.target.value === "") {
                setFormulaId("");
                setMasterLines(materials[0] ? [{ material_id: materials[0].id, kg: "" }] : []);
              } else {
                pickFormula(Number(e.target.value));
              }
            }}
          >
            <option value="">Manual (no formula)</option>
            {formulas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name || f.code} · {kgText(f.total_kg)} KG
              </option>
            ))}
          </select>
        </label>
        <label className="erp-label m-0 w-28">
          No. of Batch
          <input
            className="erp-input"
            type="number"
            min={1}
            max={50}
            step={1}
            value={batchQty}
            onChange={(e) => setBatchQty(e.target.value)}
          />
        </label>
        <label className="erp-label m-0 w-44">
          Mixing date
          <input className="erp-input" type="date" {...limits} value={masterDate} onChange={(e) => setMasterDate(e.target.value)} />
        </label>
        </div>
        {ready && formulas.length === 0 && <p className="erp-hint">No master batch formula yet. Create one in Masters → Batch Master.</p>}
        <LinesTable lines={masterLines} setLines={setMasterLines} materials={materials} errors={masterCheck.errors} kgLabel="KG per batch" minLines={1} locked={formulaId !== ""} times={qtyOk ? qtyNum : 1} />
        <div className="mt-2 flex items-center justify-between">
          {formulaId === "" ? (
            <button
              type="button"
              className="rounded-md border border-dashed border-[#d4d4d4] px-2.5 py-1 text-xs font-semibold text-[#171717] hover:bg-[#fafafa]"
              onClick={() => setMasterLines([...masterLines, { material_id: materials[0]?.id ?? 0, kg: "" }])}
            >
              + Add material
            </button>
          ) : (
            <span />
          )}
          <p className="text-sm text-[#737373]">
            Per batch: <b>{kgText(masterLines.reduce((sum, l) => sum + (Number(l.kg) > 0 ? Number(l.kg) : 0), 0))} KG</b>
            {qtyOk && qtyNum > 1 && (
              <> · {qtyNum} batches: <b>{kgText(qtyNum * masterLines.reduce((sum, l) => sum + (Number(l.kg) > 0 ? Number(l.kg) : 0), 0))} KG</b></>
            )}
          </p>
        </div>
        <div className="erp-sticky-bar mt-4 border-t border-[#e5e5e5] pt-3">
        <button type="button" className="erp-btn mt-0" onClick={createMaster} disabled={masterIssues.length > 0 || creating !== null}>
          {creating ? `Creating ${creating.done + 1} of ${creating.total}…` : qtyOk && qtyNum > 1 ? `Post ${qtyNum} Master Batches` : "Post Master Batch"}
        </button>
        {masterIssues.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs font-semibold text-red-700">{masterIssues.map((t) => <li key={t}>{t}</li>)}</ul>}
        <div className="erp-result">{masterResult}</div>
        </div>
      </div>
      ) : (
        <p className="erp-hint mb-4">You can view master batches only.</p>
      )}

      <div className="erp-panel">
        <h2 className="text-lg font-semibold">Master Batches</h2>
        <p className="erp-hint">All master batches. Batches made just now are marked New. A batch can be deleted until a final batch uses it.</p>
        {listMsg && <p className="mb-2 text-sm font-semibold text-[#171717]">{listMsg}</p>}
        {groups.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {groups.map((g) => (
              <div key={g.group} className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2">
                <div className="text-xs font-semibold text-[#171717]">{g.group}</div>
                <div className="text-xs text-[#737373]">{g.batches.length} batch{g.batches.length === 1 ? "" : "es"} · <b className="text-[#171717]">{Number(g.available_kg.toFixed(3))} KG</b> available</div>
              </div>
            ))}
          </div>
        )}
        <div className="max-w-[760px] overflow-x-auto rounded-lg border border-[#e5e5e5]">
          <table className="erp-table m-0">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Batch No</th>
                <th className="w-32">Date</th>
                <th className="w-32 text-right">Total KG</th>
                <th className="w-32 text-right">Available KG</th>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {!ready && <SkeletonRows rows={5} cols={6} />}
              {ready && allMasters.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-[#737373]">No master batch yet.</td>
                </tr>
              )}
              {allMasters.map((b, i) => (
                <tr key={b.id} className={newBatches.includes(b.batch_no) ? "bg-[#f1faf5]" : ""}>
                  <td className="tabular-nums text-[#737373]">{i + 1}</td>
                  <td className="whitespace-nowrap font-semibold">{b.batch_no}</td>
                  <td className="tabular-nums text-[#737373]">{showDate(b.date)}</td>
                  <td className="text-right tabular-nums">{kgText(b.total_kg)}</td>
                  <td className="text-right tabular-nums">{kgText(b.available_kg)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {newBatches.includes(b.batch_no) && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">New</span>}
                      {may("master", "delete") && dateOk(b.date ?? "") && Math.abs(b.available_kg - b.total_kg) < 0.0005 && (
                        <>
                          <button type="button" aria-label={`Delete ${b.batch_no}`} title="Delete" onClick={() => removeMaster(b)} className="grid h-7 w-7 place-items-center rounded-md text-[#dc2626] hover:bg-[#fef2f2] max-lg:h-10 max-lg:w-10 max-lg:bg-[#fef2f2]">{TRASH}</button>
                        </>
                      )}
                      {Math.abs(b.available_kg - b.total_kg) >= 0.0005 && <span className="text-[11px] font-semibold text-[#a3a3a3]">{b.available_kg <= 0.0005 ? "Used up" : "In use"}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {tab === "final" && !may("final", "edit") && <p className="erp-hint mb-4">You can view final batches only.</p>}
      {tab === "final" && may("final", "edit") && (
      <div className="erp-panel">
        <h2 className="text-lg font-semibold">Final Batch</h2>
        <p className="erp-hint">The KG is taken from the chosen master group, oldest batch first. The final formula fills in the extra chemicals, or choose Manual.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="erp-label">
            Master batch
            <select className="erp-input" value={masterGrp} onChange={(e) => setMasterGrp(e.target.value)}>
              {groups.length === 0 && <option value="">No ready master batch</option>}
              {groups.map((g) => (
                <option key={g.group} value={g.group}>
                  {g.group} · {kgText(g.available_kg)} KG
                </option>
              ))}
            </select>
            {selected && (
              <span className="mt-1 block text-xs font-normal text-[#737373]">
                {selected.batches.length} batch{selected.batches.length === 1 ? "" : "es"}: {kgText(selected.available_kg)} KG available
              </span>
            )}
          </label>
          <label className="erp-label">
            Final batch formula
            <select
              className="erp-input"
              value={finalFormulaId}
              onChange={(e) => {
                if (e.target.value === "") {
                  setFinalFormulaId("");
                  setFinalLines([]);
                } else {
                  const f = finalFormulas.find((x) => x.id === Number(e.target.value));
                  setFinalFormulaId(Number(e.target.value));
                  if (f) {
                    setFinalLines(linesFromFormula(f));
                    // Pick the master group with the same version, when there is one.
                    const v = versionOf(f.name || f.code);
                    const match = v ? groups.find((g) => versionOf(g.group) === v) : undefined;
                    if (match) setMasterGrp(match.group);
                  }
                }
              }}
            >
              <option value="">Manual (no formula)</option>
              {finalFormulas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name || f.code} · {kgText(f.total_kg)} KG
                </option>
              ))}
            </select>
          </label>
          <label className="erp-label">
            Final KG per batch
            <input className="erp-input bg-[#f5f5f5] font-semibold text-[#404040]" type="number" readOnly value={masterKgNum} />
          </label>
          <label className="erp-label">
            No. of Batch
            <input className="erp-input" type="number" min={1} max={50} step={1} value={finalQty} onChange={(e) => setFinalQty(e.target.value)} />
          </label>
          <label className="erp-label">
            Date
            <input className="erp-input" type="date" {...limits} value={finalDate} onChange={(e) => setFinalDate(e.target.value)} />
          </label>
        </div>
        {selected && masterKgNum > 0 && (
          <div className="mt-3 rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-sm text-[#404040]">
            <span className="font-semibold">Taken from:</span>{" "}
            {drawInOrder(selected.batches, masterKgNum * finalTimes).out.map((d, i) => (
              <span key={d.batch.id}>
                {i > 0 && " → "}
                {d.batch.batch_no} <b>{kgText(d.kg)} KG</b>
              </span>
            ))}
          </div>
        )}
        <LinesTable lines={finalLines} setLines={setFinalLines} materials={materials} errors={finalCheck.errors} kgLabel="Extra KG per batch" minLines={0} locked={finalFormulaId !== ""} times={finalTimes} />
        {finalFormulaId === "" && (
        <div className="mt-2">
          <button
            type="button"
            className="rounded-md border border-dashed border-[#d4d4d4] px-2.5 py-1 text-xs font-semibold text-[#171717] hover:bg-[#fafafa]"
            onClick={() => setFinalLines([...finalLines, { material_id: materials[0]?.id ?? 0, kg: "" }])}
          >
            + Add additional material
          </button>
        </div>
        )}
        {masterKgNum > 0 && (
          <div className="mt-3 rounded-lg bg-[#fafafa] px-3 py-2 text-sm text-[#404040]">
            <p>
              Per batch: <b>{kgText(masterKgNum)}</b> master + <b>{kgText(finalExtra)}</b> extra = <b>{kgText(masterKgNum + finalExtra)} KG</b>
            </p>
            {finalTimes > 1 && (
              <p className="mt-0.5">
                {finalTimes} batches: master <b>{kgText(masterKgNum * finalTimes)} KG</b> + extra <b>{kgText(finalExtra * finalTimes)} KG</b> = <b>{kgText((masterKgNum + finalExtra) * finalTimes)} KG</b>
              </p>
            )}
          </div>
        )}
        <div className="erp-sticky-bar mt-4 border-t border-[#e5e5e5] pt-3">
        <button type="button" className="erp-btn mt-0" onClick={createFinal} disabled={finalIssues.length > 0 || finalCreating !== null}>
          {finalCreating ? `Creating ${finalCreating.done + 1} of ${finalCreating.total}…` : fqOk && fqNum > 1 ? `Post ${fqNum} Final Batches` : "Post Final Batch"}
        </button>
        {mismatch && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">⚠ {mismatch} Check before posting.</p>}
        {finalIssues.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs font-semibold text-red-700">{finalIssues.map((t) => <li key={t}>{t}</li>)}</ul>}
        <div className="erp-result">{finalResult}</div>
        {finalMade.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-[#e5e5e5]">
            <table className="erp-table m-0">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Final Batch</th>
                  <th className="w-28 text-right">Total KG</th>
                  <th>Master batches used</th>
                </tr>
              </thead>
              <tbody>
                {finalMade.map((b, i) => (
                  <tr key={b.batch_no} className="bg-[#f1faf5]">
                    <td className="tabular-nums text-[#737373]">{i + 1}</td>
                    <td className="whitespace-nowrap font-semibold">{b.batch_no}</td>
                    <td className="text-right tabular-nums">{kgText(b.total_kg)}</td>
                    <td className="text-xs text-[#737373]">{b.from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
      )}
      {tab === "final" && (
      <div className="erp-panel mt-4">
        <h2 className="text-lg font-semibold">Final Batches</h2>
        <p className="erp-hint">All final batches. Batches made just now are marked New. A batch can be deleted until production uses it.</p>
        {finals.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {[...new Set(finals.map((b) => finalGroup(b.batch_no)))].map((g) => {
              const rows = finals.filter((b) => finalGroup(b.batch_no) === g);
              const kg = Number(rows.reduce((sum, b) => sum + b.available_kg, 0).toFixed(3));
              return (
                <div key={g} className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2">
                  <div className="text-xs font-semibold text-[#171717]">{g}</div>
                  <div className="text-xs text-[#737373]">{rows.length} batch{rows.length === 1 ? "" : "es"} · <b className="text-[#171717]">{kg} KG</b> available</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-[#e5e5e5]">
          <table className="erp-table m-0">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Final Batch</th>
                <th className="w-32">Date</th>
                <th className="w-28 text-right">Total KG</th>
                <th className="w-32 text-right">Available KG</th>
                <th>Master batches used</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {!ready && <SkeletonRows rows={5} cols={7} />}
              {ready && finals.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-[#737373]">No final batch yet.</td>
                </tr>
              )}
              {finals.map((b, i) => {
                const fresh = finalMade.some((x) => x.batch_no === b.batch_no);
                return (
                  <tr key={b.id} className={fresh ? "bg-[#f1faf5]" : ""}>
                    <td className="tabular-nums text-[#737373]">{i + 1}</td>
                    <td className="whitespace-nowrap font-semibold">{b.batch_no}</td>
                    <td className="tabular-nums text-[#737373]">{showDate(b.date)}</td>
                    <td className="text-right tabular-nums">{kgText(b.total_kg)}</td>
                    <td className="text-right tabular-nums">{kgText(b.available_kg)}</td>
                    <td className="text-xs text-[#737373]">{b.from ?? "—"}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {fresh && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">New</span>}
                        {may("final", "delete") && dateOk(b.date ?? "") && Math.abs(b.available_kg - b.total_kg) < 0.0005 && (
                          <button type="button" aria-label={`Delete ${b.batch_no}`} title="Delete" onClick={() => removeFinal(b)} className="grid h-7 w-7 place-items-center rounded-md text-[#dc2626] hover:bg-[#fef2f2] max-lg:h-10 max-lg:w-10 max-lg:bg-[#fef2f2]">{TRASH}</button>
                        )}
                        {Math.abs(b.available_kg - b.total_kg) >= 0.0005 && <span className="text-[11px] font-semibold text-[#a3a3a3]">{b.available_kg <= 0.0005 ? "Used up" : "In use"}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
