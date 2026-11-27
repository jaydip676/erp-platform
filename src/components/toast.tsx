"use client";

import { useSyncExternalStore } from "react";

/**
 * App-wide toasts for success and error messages. Call toast.success("…") / toast.error("…") from
 * anywhere in the browser (also outside React). The same message shown twice in a row is merged.
 */
export type ToastKind = "success" | "error" | "warning" | "info";
type Item = { id: number; kind: ToastKind; text: React.ReactNode; key: string; count: number };

let items: Item[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const emit = () => listeners.forEach((l) => l());

const LIFE: Record<ToastKind, number> = { success: 3500, info: 4000, warning: 6000, error: 6500 };
const MAX = 4;

function keyOf(text: React.ReactNode) {
  return typeof text === "string" || typeof text === "number" ? String(text) : "";
}

function schedule(id: number, kind: ToastKind) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => dismiss(id), LIFE[kind]));
}

function push(kind: ToastKind, text: React.ReactNode) {
  if (typeof window === "undefined" || text == null || text === "") return;
  const key = keyOf(text);
  // A screen often repeats an error the request already reported: do not show it again as a plain note.
  if (key && kind !== "error" && items.some((t) => t.kind === "error" && t.key === key)) return;
  const same = key ? items.find((t) => t.kind === kind && t.key === key) : undefined;
  if (same) {
    items = items.map((t) => (t.id === same.id ? { ...t, count: t.count + 1 } : t));
    schedule(same.id, kind);
  } else {
    const id = nextId++;
    items = [...items, { id, kind, text, key, count: 1 }].slice(-MAX);
    schedule(id, kind);
  }
  emit();
}

function dismiss(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (text: React.ReactNode) => push("success", text),
  error: (text: React.ReactNode) => push("error", text),
  warning: (text: React.ReactNode) => push("warning", text),
  info: (text: React.ReactNode) => push("info", text),
  show: (kind: ToastKind, text: React.ReactNode) => push(kind, text),
  dismiss,
};

const ICON: Record<ToastKind, { bg: string; path: string }> = {
  success: { bg: "bg-emerald-600", path: "M5 12l5 5L20 7" },
  error: { bg: "bg-rose-600", path: "M12 7v6M12 17h.01" },
  warning: { bg: "bg-amber-500", path: "M12 7v6M12 17h.01" },
  info: { bg: "bg-[#171717]", path: "M12 11v6M12 7h.01" },
};

const TITLE: Record<ToastKind, string> = { success: "Done", error: "Something went wrong", warning: "Check this", info: "Note" };

/** Mounted once in the root layout. Phones: top of the screen, below the notch. Desktop: bottom right. */
export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-auto sm:items-end sm:px-5 sm:pb-5 sm:pt-0"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          onMouseEnter={() => clearTimeout(timers.get(t.id))}
          onMouseLeave={() => schedule(t.id, t.kind)}
          className="erp-toast pointer-events-auto flex w-full max-w-[400px] items-start gap-3 rounded-xl border border-[#e5e5e5] bg-white px-3.5 py-3 text-sm shadow-[0_0_0_1px_rgb(0_0_0/0.03),0_4px_10px_rgb(0_0_0/0.08),0_16px_40px_rgb(0_0_0/0.18)]"
        >
          <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white ${ICON[t.kind].bg}`} aria-hidden>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON[t.kind].path} />
            </svg>
          </span>
          <div className="min-w-0 flex-1 leading-snug">
            <div className="font-semibold text-[#0a0a0a]">
              {TITLE[t.kind]}
              {t.count > 1 && <span className="ml-1.5 rounded bg-[#f4f4f5] px-1.5 text-[11px] font-semibold text-[#737373]">×{t.count}</span>}
            </div>
            <div className="mt-0.5 break-words text-[13px] text-[#525252]">{t.text}</div>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#a3a3a3] hover:bg-[#f5f5f5] hover:text-[#171717]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
