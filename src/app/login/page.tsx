"use client";

import { Busy } from "@/components/spinner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiClientError } from "@/lib/client-api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const [busy, setBusy] = useState(false);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.push("/");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[#f7f7f7] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <form onSubmit={login} className="w-[min(92vw,390px)] rounded-2xl border border-[#e5e5e5] bg-white p-8 shadow-sm">
        <div className="erp-brand">
          NIVA <span>ERP</span>
        </div>
        <p className="text-sm text-[#737373]">Production & Inventory Management</p>
        <label className="erp-label">Username</label>
        <input className="erp-input" value={username} onChange={(e) => setUsername(e.target.value)} />
        <label className="erp-label">Password</label>
        <input
          className="erp-input"
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="erp-btn mt-3 w-full" disabled={busy}>
          {busy ? <Busy>Signing in…</Busy> : "Login"}
        </button>
        {msg && <small className="mt-3 block font-medium text-red-700">{msg}</small>}
      </form>
    </div>
  );
}