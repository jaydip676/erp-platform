"use client";

import { ScrollLock } from "@/lib/use-scroll-lock";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Ask = { title: string; body?: React.ReactNode; confirm?: string; danger?: boolean };
type Pending = Ask & { resolve: (ok: boolean) => void };

const Ctx = createContext<(ask: Ask) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (!(await confirm({ title: "Delete …?" }))) return;` */
export function useConfirm() {
  return useContext(Ctx);
}

/** Renders the app's confirm dialog. Replaces the browser's plain OK/Cancel box. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback((a: Ask) => new Promise<boolean>((resolve) => setPending({ ...a, resolve })), []);
  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0a0a0a]/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <ScrollLock />
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="flex gap-4">
              {pending.danger !== false && (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </span>
              )}
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-base font-semibold text-[#0a0a0a]">{pending.title}</h2>
                {pending.body && <div className="mt-1.5 text-sm text-[#525252]">{pending.body}</div>}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:m-0 [&>button]:w-full sm:[&>button]:w-auto">
              <button type="button" className="erp-btn erp-btn-secondary mt-0" onClick={() => close(false)}>Cancel</button>
              <button
                ref={okRef}
                type="button"
                className={`erp-btn mt-0 ${pending.danger !== false ? "!border-rose-600 !bg-rose-600 hover:!bg-rose-700" : ""}`}
                onClick={() => close(true)}
              >
                {pending.confirm ?? "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
