"use client";

import { useRef, useState } from "react";

/**
 * Wraps a save/post handler so it cannot run twice at once (double-click, Enter key repeat).
 * Returns the guarded handler and a busy flag for disabling the button.
 */
export function useSubmit<A extends unknown[]>(fn: (...args: A) => Promise<unknown> | unknown) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  async function run(...args: A) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await fn(...args);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return [run, busy] as const;
}
