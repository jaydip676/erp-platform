"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";

type Size = { id: number; size: string; valves: string[] };

export function SizesClient({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Size[]>([]);
  const [size, setSize] = useState("");
  const [valves, setValves] = useState("");
  const [extra, setExtra] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");

  async function load() {
    setRows(await api<Size[]>("/api/masters/sizes"));
  }

  useEffect(() => {
    load().catch(() => setRows([]));
  }, []);

  async function addSize() {
    try {
      await api("/api/masters/sizes", {
        method: "POST",
        body: JSON.stringify({
          size,
          valves: valves.split(",").map((v) => v.trim()).filter(Boolean),
        }),
      });
      setSize("");
      setValves("");
      setMsg("Size added");
      await load();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "Could not add size");
    }
  }

  async function addValve(id: number) {
    const valve = extra[id]?.trim();
    if (!valve) return;
    try {
      await api(`/api/masters/sizes/${id}`, { method: "PATCH", body: JSON.stringify({ add_valve: valve }) });
      setExtra((p) => ({ ...p, [id]: "" }));
      await load();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "Could not add valve");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#737373]">
        Sizes and the valves that fit them. Product List can only use a size and valve that exist here.
      </p>
      {isAdmin && (
        <div className="erp-panel">
          <h2 className="mb-2 text-lg font-semibold">Add size</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="erp-label">
              Size
              <input className="erp-input" value={size} placeholder="3.00-18" onChange={(e) => setSize(e.target.value)} />
            </label>
            <label className="erp-label">
              Valves, comma separated
              <input className="erp-input" value={valves} placeholder="TR-29, V1-08-01" onChange={(e) => setValves(e.target.value)} />
            </label>
          </div>
          <button type="button" className="erp-btn" onClick={addSize}>Save size</button>
          {msg && <p className="erp-result">{msg}</p>}
        </div>
      )}
      <div className="erp-panel overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Size</th>
              <th>Valves</th>
              {isAdmin && <th>Add valve</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{r.size}</td>
                <td>{r.valves.length ? r.valves.join(", ") : "—"}</td>
                {isAdmin && (
                  <td>
                    <div className="flex gap-2">
                      <input className="erp-input mt-0 w-36" value={extra[r.id] ?? ""} placeholder="TR-13" onChange={(e) => setExtra((p) => ({ ...p, [r.id]: e.target.value }))} />
                      <button type="button" className="erp-btn mt-0" onClick={() => addValve(r.id)}>Add</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
