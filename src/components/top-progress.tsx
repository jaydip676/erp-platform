"use client";

import { useEffect, useState } from "react";
import { onPending } from "@/lib/client-api";

/** A thin black bar at the top of the screen while the app is talking to the server. */
export function TopProgress() {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  useEffect(() => onPending((n) => setBusy(n > 0)), []);
  useEffect(() => {
    // Quick requests do not flash the bar.
    if (!busy) {
      const t = setTimeout(() => setShow(false), 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShow(true), 150);
    return () => clearTimeout(t);
  }, [busy]);
  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[110] h-[3px] overflow-hidden transition-opacity duration-200 ${show ? "opacity-100" : "opacity-0"}`}>
      <div className={`erp-progress h-full bg-[#171717] ${busy ? "" : "erp-progress-done"}`} />
    </div>
  );
}
