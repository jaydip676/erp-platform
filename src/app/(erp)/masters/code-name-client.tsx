"use client";

import { useConfirm } from "@/components/confirm";
import { useSubmit } from "@/lib/use-submit";
import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";

type Row = { id: number; code: string; name: string };

export function CodeNameClient({
  isAdmin,
  canDelete = isAdmin,
  title,
  hint,
  endpoint,
}: {
  isAdmin: boolean;
  canDelete?: boolean;
  title: string;
  hint: string;
  endpoint: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    setRows(await api<Row[]>(endpoint));
  }

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [endpoint]);

  function reset() {
    setEditing(null);
    setCode("");
    setName("");
    setError("");
  }

  const confirm = useConfirm();
  async function remove(row: Row) {
    if (!(await confirm({ title: `Delete ${row.name}?`, body: `Code ${row.code} is removed from the list.` }))) return;
    try {
      await api(`${endpoint}?id=${row.id}`, { method: "DELETE" });
      if (editing === row.id) reset();
      setMsg(`${row.name} deleted`);
      setError("");
      await load();
    } catch (e) {
      setMsg("");
      setError(e instanceof ApiClientError ? e.message : "Could not delete");
    }
  }

  const [saveOnce, saveBusy] = useSubmit(save);
  async function save() {
    if (!name.trim()) {
      setMsg("");
      setError("Enter a name.");
      return;
    }
    try {
      await api(endpoint, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(editing ? { id: editing, name } : { name }),
      });
      const saved = editing ? "Saved" : `${name.trim()} added`;
      reset();
      setMsg(saved);
      await load();
    } catch (e) {
      setMsg("");
      setError(e instanceof ApiClientError ? e.message : "Could not save");
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="erp-panel">
          <h2 className="mb-1 text-lg font-semibold">{editing ? `Edit ${title}` : title}</h2>
          <p className="erp-hint">{hint} {editing ? `Code ${code} stays the same.` : "The code is assigned automatically."}</p>
          <label className="erp-label max-w-md">
            Name
            <input
              className="erp-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </label>
          <button type="button" className="erp-btn" onClick={saveOnce} disabled={saveBusy}>{saveBusy ? "Saving…" : editing ? "Save" : "Add"}</button>
          {editing && <button type="button" className="erp-btn erp-btn-secondary" onClick={reset}>Cancel</button>}
          {msg && <p className="erp-result">{msg}</p>}
          {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
        </div>
      )}
      <div className="erp-panel overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-semibold">{row.code}</td>
                <td>{row.name}</td>
                <td>
                  {(isAdmin || canDelete) && (
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                      <button
                        type="button"
                        className="erp-btn erp-btn-secondary mt-0"
                        onClick={() => {
                          setEditing(row.id);
                          setCode(row.code);
                          setName(row.name);
                          setMsg("");
                          setError("");
                        }}
                      >
                        Edit
                      </button>
                      )}
                      {canDelete && (
                      <button
                        type="button"
                        aria-label={`Delete ${row.name}`}
                        title="Delete"
                        onClick={() => remove(row)}
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
