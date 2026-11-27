/** "R16 - 235 / TR13 SV / VZ": size, then valve, then brand, leaving out whatever is empty. */
export const productName = (p: { size: string; valveType: string; brand?: string | null }) =>
  [p.size, p.valveType, p.brand].filter(Boolean).join(" / ");
