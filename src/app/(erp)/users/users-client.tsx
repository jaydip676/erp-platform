"use client";

import { IconAction } from "@/components/icon-action";
import { Select } from "@/components/select";
import { Busy } from "@/components/spinner";
import { useEffect, useMemo, useState } from "react";
import { SkeletonRows } from "@/components/skeleton";
import { api, ApiClientError } from "@/lib/client-api";
import { useSubmit } from "@/lib/use-submit";
import { Banner } from "@/components/banner";
import { useConfirm } from "@/components/confirm";
import { ACTION_LABEL, ALL_PERMISSIONS, PERMISSION_PAGES, itemKeys, normalizePermissions, type Action } from "@/lib/permissions";

type User = {
  id: number;
  username: string;
  display_name: string;
  role: "admin" | "user";
  active: boolean;
  permissions: string[];
  entry_days: number | null;
  created_at: string | null;
  last_login_at: string | null;
};
type Form = { id: number | null; username: string; display_name: string; password: string; role: "admin" | "user"; permissions: string[]; entry_days: string };

const EMPTY: Form = { id: null, username: "", display_name: "", password: "", role: "user", permissions: [], entry_days: "" };
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

const daysValue = (v: string) => (v.trim() === "" ? null : Number(v));

const ACTIONS: Action[] = ["view", "add", "edit", "delete"];

function PermissionMatrix({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const set = new Set(value);
  // Turning off View also turns off Add, Edit and Delete of that section; turning on any of them adds View.
  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(value);
    for (const k of keys) {
      if (on) next.add(k);
      else {
        next.delete(k);
        if (k.endsWith(".view")) {
          const base = k.slice(0, -5);
          next.delete(`${base}.add`);
          next.delete(`${base}.edit`);
          next.delete(`${base}.delete`);
        }
      }
    }
    // A page with nothing ticked inside it is closed too.
    for (const p of PERMISSION_PAGES) {
      if (!on && p.items.length > 0 && !p.items.some((i) => itemKeys(i).some((k) => next.has(k)))) next.delete(p.view);
    }
    onChange(normalizePermissions([...next]));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="erp-btn erp-btn-secondary" disabled={disabled} onClick={() => onChange(normalizePermissions(ALL_PERMISSIONS))}>
          Select everything
        </button>
        <button type="button" className="erp-btn erp-btn-secondary" disabled={disabled} onClick={() => onChange([])}>
          Clear all
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {PERMISSION_PAGES.map((p) => {
          const pageOn = set.has(p.view);
          const childKeys = p.items.flatMap(itemKeys);
          const childOn = childKeys.filter((k) => set.has(k)).length;
          return (
            <div key={p.page} className={`rounded-lg border px-3 py-2 ${pageOn ? "border-[#171717] bg-white" : "border-[#e5e5e5] bg-[#fafafa]"}`}>
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#171717]"
                    checked={pageOn}
                    disabled={disabled}
                    // A page with sections opens with View on all of them; turning it off clears everything inside.
                    onChange={(e) =>
                      e.target.checked
                        ? toggle([p.view, ...p.items.map((i) => `${i.base}.view`)], true)
                        : onChange(normalizePermissions(value.filter((k) => k !== p.view && !childKeys.includes(k))))
                    }
                  />
                  {p.label}
                </label>
                {childKeys.length > 0 && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#737373] hover:text-[#171717] disabled:opacity-40"
                    disabled={disabled}
                    onClick={() =>
                      childOn < childKeys.length
                        ? toggle([p.view, ...childKeys], true)
                        : onChange(normalizePermissions(value.filter((k) => k !== p.view && !childKeys.includes(k))))
                    }
                  >
                    {childOn < childKeys.length ? "All" : "None"}
                  </button>
                )}
              </div>
              {p.items.length > 0 && (
                <table className="mt-1.5 w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] text-[#a3a3a3]">
                      <th className="py-1 pl-6 text-left font-medium" />
                      {ACTIONS.map((a) => <th key={a} className="w-16 py-1 text-center font-medium">{ACTION_LABEL[a]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {p.items.map((i) => (
                      <tr key={i.base} className="border-t border-[#f0f0f0]" title={i.hint}>
                        <td className="py-1.5 pl-6 text-[#404040]">{i.label}</td>
                        {ACTIONS.map((a) => {
                          const key = `${i.base}.${a}`;
                          return (
                            <td key={a} className="py-1.5 text-center">
                              {i.actions.includes(a) ? (
                                <input
                                  type="checkbox"
                                  aria-label={`${i.label} ${ACTION_LABEL[a]}`}
                                  className="h-3.5 w-3.5 accent-[#171717]"
                                  checked={set.has(key)}
                                  disabled={disabled}
                                  onChange={(e) => toggle(e.target.checked ? [p.view, key] : [key], e.target.checked)}
                                />
                              ) : (
                                <span className="text-[#d4d4d4]">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {p.items.length === 0 && <p className="mt-1 pl-6 text-xs text-[#a3a3a3]">Open and view this page.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UsersClient({ meId }: { meId: number }) {
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");

  const load = () => api<User[]>("/api/users").then(setUsers).catch((e) => {
    setUsers([]);
    setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not load users." });
  });
  useEffect(() => { load(); }, []);

  const pageCount = (perms: string[]) => PERMISSION_PAGES.filter((p) => perms.includes(p.view));
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (users ?? []).filter((u) => !n || `${u.username} ${u.display_name}`.toLowerCase().includes(n));
  }, [users, q]);

  const [saveOnce, saving] = useSubmit(save);
  async function save() {
    if (!form) return;
    try {
      if (form.id == null) {
        await api("/api/users", { method: "POST", body: JSON.stringify({ username: form.username, password: form.password, display_name: form.display_name, role: form.role, permissions: form.permissions, entry_days: daysValue(form.entry_days) }) });
        setMsg({ ok: true, text: `User ${form.username} created.` });
      } else {
        await api("/api/users", {
          method: "PATCH",
          body: JSON.stringify({ id: form.id, display_name: form.display_name, role: form.role, permissions: form.permissions, entry_days: daysValue(form.entry_days), ...(form.password ? { password: form.password } : {}) }),
        });
        setMsg({ ok: true, text: `${form.username} saved.${form.password ? " New password set." : ""}` });
      }
      setForm(null);
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not save. Try again." });
    }
  }

  async function setActive(u: User, active: boolean) {
    if (!active && !(await confirm({ title: `Disable ${u.username}?`, body: "They are signed out at once and cannot log in until enabled again.", confirm: "Disable", danger: true }))) return;
    try {
      await api("/api/users", { method: "PATCH", body: JSON.stringify({ id: u.id, active }) });
      setMsg({ ok: true, text: `${u.username} ${active ? "enabled" : "disabled"}.` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not change. Try again." });
    }
  }

  async function remove(u: User) {
    if (!(await confirm({ title: `Delete ${u.username}?`, body: "They can never log in again and are removed from this list. Entries they posted stay in the records. This cannot be undone.", confirm: "Delete user", danger: true }))) return;
    try {
      await api(`/api/users?id=${u.id}`, { method: "DELETE" });
      setMsg({ ok: true, text: `${u.username} deleted.` });
      if (form?.id === u.id) setForm(null);
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiClientError ? e.message : "Could not delete. Try again." });
    }
  }

  const issues: string[] = [];
  if (form) {
    if (form.id == null && !/^[a-zA-Z0-9._-]{3,40}$/.test(form.username.trim())) issues.push("User ID: 3 to 40 letters, numbers, dot, dash or underscore.");
    if (form.id == null && form.password.length < 6) issues.push("Password needs at least 6 characters.");
    if (form.id != null && form.password && form.password.length < 6) issues.push("New password needs at least 6 characters.");
    if (form.role === "user" && pageCount(form.permissions).length === 0) issues.push("Tick at least one page, or the user will see nothing.");
    if (form.role === "user" && form.entry_days.trim() !== "" && !/^\d{1,3}$/.test(form.entry_days.trim())) issues.push("Entry days must be a whole number (0 = today only), or empty for no limit.");
  }
  const isMe = form?.id === meId;

  return (
    <div className="space-y-4">
      {msg && <Banner ok={msg.ok} onClose={() => setMsg(null)}>{msg.text}</Banner>}

      {form ? (
        <div className="erp-panel">
          <h2 className="text-lg font-semibold">{form.id == null ? "New user" : `Edit ${form.username}`}</h2>
          <p className="erp-hint">Admins can open everything, including this page. Other users see only the pages, tabs and actions ticked below.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="erp-label">
              User ID (for login)
              <input className="erp-input" value={form.username} disabled={form.id != null} autoComplete="off" placeholder="e.g. ramesh" onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </label>
            <label className="erp-label">
              Full name
              <input className="erp-input" value={form.display_name} placeholder="Optional" onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </label>
            <label className="erp-label">
              {form.id == null ? "Password" : "New password"}
              <input className="erp-input" type="password" autoComplete="new-password" value={form.password} placeholder={form.id == null ? "At least 6 characters" : "Leave empty to keep"} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <label className="erp-label">
              Access
              <Select className="erp-input" value={form.role} disabled={isMe} onChange={(e) => setForm({ ...form, role: e.target.value as Form["role"] })}>
                <option value="user">Chosen permissions</option>
                <option value="admin">Admin (everything + users)</option>
              </Select>
            </label>
          </div>
          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold">Permissions</div>
            {form.role === "admin" ? (
              <p className="rounded-lg bg-[#fafafa] px-3 py-2 text-sm text-[#737373]">Admins have every permission and can manage users.</p>
            ) : (
              <>
                <label className="erp-label mb-3 max-w-md">
                  Entry days (back-dating limit)
                  <input
                    className="erp-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="Empty = no limit"
                    value={form.entry_days}
                    onChange={(e) => setForm({ ...form, entry_days: e.target.value })}
                  />
                  <span className="text-xs font-normal text-[#737373]">
                    {form.entry_days.trim() === ""
                      ? "No limit: this user can add, edit and delete entries on any date."
                      : Number(form.entry_days) === 0
                        ? "Only today: entries can be added, edited and deleted for today only."
                        : `Entries can be added, edited and deleted only from ${form.entry_days} day${form.entry_days.trim() === "1" ? "" : "s"} ago up to today. No future dates.`}
                  </span>
                </label>
                <PermissionMatrix value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />
              </>
            )}
          </div>
          {issues.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs font-semibold text-rose-700">{issues.map((t) => <li key={t}>{t}</li>)}</ul>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="erp-btn" disabled={saving || issues.length > 0} onClick={saveOnce}>
              {saving ? <Busy>Saving…</Busy> : form.id == null ? "Create user" : "Save changes"}
            </button>
            <button type="button" className="erp-btn erp-btn-secondary" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input className="erp-input m-0 min-w-0 flex-1 lg:max-w-xs lg:flex-none" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="erp-btn max-lg:m-0" onClick={() => { setMsg(null); setForm({ ...EMPTY }); }}>+ New user</button>
        </div>
      )}

      <div className="erp-panel">
        <div className="overflow-x-auto">
          <table className="erp-table erp-stack m-0">
            <thead>
              <tr>
                <th>User</th>
                <th>Access</th>
                <th>Status</th>
                <th>Last login</th>
                <th className="w-64" />
              </tr>
            </thead>
            <tbody>
              {users === null && <SkeletonRows rows={5} cols={5} />}
              {users !== null && shown.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-[#a3a3a3]">No users.</td></tr>}
              {shown.map((u) => {
                const pages = pageCount(u.permissions);
                return (
                  <tr key={u.id} className={u.active ? "" : "text-[#a3a3a3]"}>
                    <td className="erp-stack-full">
                      <div className="font-semibold">{u.username}{u.id === meId && <span className="ml-1 text-xs font-normal text-[#737373]">(you)</span>}</div>
                      {u.display_name && <div className="text-xs text-[#737373]">{u.display_name}</div>}
                    </td>
                    <td className="erp-stack-full" data-label="Access">
                      {u.role === "admin" ? (
                        <span className="rounded-full bg-[#171717] px-2 py-0.5 text-xs font-semibold text-white">Admin</span>
                      ) : pages.length === 0 ? (
                        <span className="text-xs font-semibold text-amber-700">No pages</span>
                      ) : (
                        <span className="text-xs text-[#525252]" title={u.permissions.join("\n")}>{pages.map((p) => p.label).join(", ")}</span>
                      )}
                    </td>
                    <td data-label="Status">{u.active ? <span className="text-xs font-semibold text-emerald-700">Active</span> : <span className="text-xs font-semibold text-rose-700">Disabled</span>}</td>
                    <td className="whitespace-nowrap text-xs text-[#737373]" data-label="Last login">{when(u.last_login_at)}</td>
                    <td className="erp-stack-full whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1 max-lg:-mr-2 max-lg:w-full max-lg:justify-end">
                        <IconAction kind="edit" label="Edit" onClick={() => { setMsg(null); setForm({ id: u.id, username: u.username, display_name: u.display_name, password: "", role: u.role, permissions: u.permissions, entry_days: u.entry_days == null ? "" : String(u.entry_days) }); }} />
                        {u.id !== meId && (
                          <>
                            <IconAction kind={u.active ? "disable" : "enable"} label={u.active ? "Disable" : "Enable"} onClick={() => setActive(u, !u.active)} />
                            <IconAction kind="delete" label="Delete" onClick={() => remove(u)} />
                          </>
                        )}
                      </div>
                    </td>
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
