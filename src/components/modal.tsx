"use client";

import { useEffect, useRef } from "react";
import { ScrollLock } from "@/lib/use-scroll-lock";

/**
 * Popup used for creating and editing master records. Phones: a sheet from the bottom.
 * Closes on Escape, the × button, or a click on the dark area (unless busy).
 */
export function Modal({
  title,
  onClose,
  busy = false,
  size = "md",
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Escape closes only the top-most popup (a confirm or a dropdown opened from this one closes first).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      const all = document.querySelectorAll('[aria-modal="true"], [role="listbox"]');
      if (all.length && all[all.length - 1] !== box.current) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  const width = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" }[size];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0a0a0a]/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <ScrollLock />
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} className={`erp-sheet relative flex max-h-[94dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${width}`}>
        <div className="flex items-center justify-between gap-3 border-b border-[#f0f0f0] px-5 py-3.5 sm:px-6">
          <h2 className="m-0 text-base font-semibold text-[#0a0a0a]">{title}</h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="-mr-2 grid h-9 w-9 place-items-center rounded-lg text-[#737373] hover:bg-[#f5f5f5] disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">{children}</div>
      </div>
    </div>
  );
}
