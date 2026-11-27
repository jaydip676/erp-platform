/**
 * Suggested Green Tube transfers: a source size and the sizes it is usually split into,
 * with each size's share of the PCS. 64 PCS of 75016 -> 32 R17 + 32 R16.
 * These show first in the transfer screen; any other size can still be chosen.
 */
export const GREEN_TUBE_TRANSFERS: Record<string, { size: string; share: number }[]> = {
  "75016": [{ size: "R17", share: 0.5 }, { size: "R16", share: 0.5 }],
  "10020": [{ size: "110020", share: 0.5 }, { size: "120020", share: 0.5 }],
  "12428": [{ size: "13628", share: 1 }],
  "37512": [{ size: "412", share: 1 }],
  R12: [{ size: "512", share: 1 }],
  "16928": [{ size: "18430", share: 0.5 }, { size: "16930", share: 0.5 }],
  "120024": [{ size: "160025", share: 1 }],
};

/** Splits PCS over the shares; the last size takes what is left so the total always matches. */
export function splitByShare(total: number, shares: number[]) {
  const sum = shares.reduce((s, x) => s + x, 0) || 1;
  const out = shares.map((s) => Math.floor((total * s) / sum));
  if (out.length) out[out.length - 1] += total - out.reduce((s, x) => s + x, 0);
  return out;
}
