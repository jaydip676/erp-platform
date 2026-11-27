"use client";

import { useEffect, useRef } from "react";
import { toast, type ToastKind } from "@/components/toast";

const ERRORISH = /^(could not|cannot|can't|not |no |only |failed|error|enter |select |choose |you do not|this is )/i;

/**
 * Shows a page message as a toast and clears it, so the same message can show again later.
 * Without a kind it is guessed from the text: "Could not…", "Only…" are errors, "Stopped" is a warning.
 */
export function Notice({ text, kind, onDone }: { text: string; kind?: ToastKind; onDone: () => void }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !text) return;
    sent.current = true;
    toast.show(kind ?? (/stopped/i.test(text) ? "warning" : ERRORISH.test(text) ? "error" : "success"), text);
    onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
