/** Max actual KG for extrusion: (piece KG × output PCS) + ExKg% of that weight. */
export function maxConsumedKg(pieceKg: number, outputPcs: number, exKgPercent: number) {
  const base = pieceKg * outputPcs;
  const allowance = base * (exKgPercent / 100);
  return Number((base + allowance).toFixed(3));
}

/** The most that can be entered: the calculated limit rounded up to the next whole KG (234.6 -> 235). */
export function allowedConsumedKg(maxKg: number) {
  return Math.ceil(Number(maxKg.toFixed(3)) - 1e-9);
}
