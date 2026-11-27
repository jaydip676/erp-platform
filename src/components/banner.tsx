"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/toast";

/**
 * Result of a save, post or delete.
 * With onClose (the usual page message) it is shown as a toast and cleared straight away, so the next
 * message shows again. Without onClose (inside a popup or form) it stays in place as an inline note.
 */
export function Banner({ ok, warn = false, children, onClose }: { ok: boolean; warn?: boolean; children: React.ReactNode; onClose?: () => void }) {
  const sent = useRef(false);
  useEffect(() => {
    if (!onClose || sent.current) return;
    sent.current = true;
    toast.show(warn ? "warning" : ok ? "success" : "error", children);
    onClose();
    // Shown once when it appears; a new message mounts a new Banner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (onClose) return null;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${warn ? "border-amber-200 bg-amber-50 text-amber-900" : ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-800"}`}
    >
      <span aria-hidden className="font-bold">{warn ? "⚠" : ok ? "✓" : "!"}</span>
      <span>{children}</span>
    </div>
  );
}
