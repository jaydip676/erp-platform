/** Rough vehicle class from the VIAZ size master. Used only for the admin mix view. */
export function segmentForSize(size: string) {
  const s = size.trim().toUpperCase();
  if (s.includes("CYCLE")) return "CYCLE";
  if (s.startsWith("R-") || s.startsWith("6.00") || s.startsWith("7.00")) return "4 WHEELER";
  if (
    s.startsWith("1000") ||
    s.startsWith("1200") ||
    s.startsWith("12.4") ||
    s.startsWith("16.9") ||
    s.startsWith("9.00") ||
    s.startsWith("7.50")
  ) {
    return "OTR";
  }
  return "2 & 3 WHEELER";
}

export const SEGMENT_ORDER = ["2 & 3 WHEELER", "4 WHEELER", "OTR", "CYCLE"] as const;
