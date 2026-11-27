"use client";

import { createContext, useContext } from "react";

export type EntryWindow = { min: string; max: string; days: number } | null;

const Ctx = createContext<EntryWindow>(null);

/** Set once by the app shell from the signed-in user's "Entry days". */
export function EntryWindowProvider({ value, children }: { value: EntryWindow; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** min / max for a date input, so users with an entry-days limit can only pick allowed dates. Empty for no limit. */
export function useDateLimits(): { min?: string; max?: string } {
  const w = useContext(Ctx);
  return w ? { min: w.min, max: w.max } : {};
}

/** True when this date may be added, edited or deleted by the current user. */
export function useDateAllowed() {
  const w = useContext(Ctx);
  return (iso: string) => !w || (iso.slice(0, 10) >= w.min && iso.slice(0, 10) <= w.max);
}
