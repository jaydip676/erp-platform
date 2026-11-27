"use client";

import { IconAction } from "@/components/icon-action";
import { Modal } from "@/components/modal";
import { AddButton } from "@/components/add-button";
import { Busy } from "@/components/spinner";
import { Notice } from "@/components/notice";
import { useConfirm } from "@/components/confirm";
import { useSubmit } from "@/lib/use-submit";
import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";

type Row = { id: number; code: string; name: string };

export function CodeNameClient({
  isAdmin,
  canAdd = isAdmin,
  canDelete = isAdmin,
  noun = "entry",
  title,
  hint,
  endpoint,
}: {
  isAdmin: boolean;
  canAdd?: boolean;
  canDelete?: boolean;
  /** What one row is called on the New button and popup, e.g. "group" or "brand". */
  noun?: string;
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

  const [adding, setAdding] = useState(false);
  function reset() {
    setEditing(null);
    setAdding(false);
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
      {msg && <Notice text={msg} kind="success" onDone={() => setMsg("")} />}
      {error && <Notice text={error} kind="error" onDone={() => setError("")} />}
      {((editing && isAdmin) || (adding && canAdd)) && (
        <Modal title={editing ? `Edit ${noun}` : `New ${noun}`} onClose={reset} busy={saveBusy} size="sm">
          <p className="erp-hint">{hint} {editing ? `Code ${code} stays the same.` : "The code is assigned automatically."}</p>
          <label className="erp-label">
            Name
            <input
              className="erp-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveOnce()}
            />
          </label>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:m-0">
            <button type="button" className="erp-btn erp-btn-secondary" onClick={reset} disabled={saveBusy}>Cancel</button>
            <button type="button" className="erp-btn" onClick={saveOnce} disabled={saveBusy}>{saveBusy ? <Busy>Saving…</Busy> : editing ? "Save" : "Add"}</button>
          </div>
        </Modal>
      )}
      <div className="erp-panel overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">{title}</h2>
          {canAdd && <AddButton label={`New ${noun}`} onClick={() => { reset(); setAdding(true); }} />}
        </div>
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
                      <IconAction kind="edit" label="Edit" onClick={() => {
                          setEditing(row.id);
                          setCode(row.code);
                          setName(row.name);
                          setMsg("");
                          setError("");
                      }} />
                      )}
                      {canDelete && (
                      <IconAction kind="delete" label="Delete" onClick={() => remove(row)} />
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
