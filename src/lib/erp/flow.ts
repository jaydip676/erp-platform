export const PROCESS_FLOW = {
  extrusion: { source: "FINAL", target: "EXTRUSION", label: "Final Batch to Extrusion", consumes: "KG" as const },
  curing: { source: "EXTRUSION", target: "CURED", label: "Green tubes to Press", consumes: "PCS" as const },
  inspection: { source: "CURED", target: "QC", label: "Inspection — to Quality Approved (Unpacked)", consumes: "PCS" as const },
  packing: { source: "QC", target: "FG", label: "Packing — to Finished Goods", consumes: "PCS" as const },
} as const;

export type Stage = keyof typeof PROCESS_FLOW;

export const STAGE_ORDER = Object.keys(PROCESS_FLOW) as Stage[];

/** Every department the plant uses. Created on first use if the database was not seeded with them. */
export const DEPARTMENTS: readonly (readonly [string, string])[] = [
  ["RAW", "Raw Material Store"],
  ["MASTER", "Master Batch"],
  ["FINAL", "Final Batch"],
  ["EXTRUSION", "Green Tube"],
  ["CURING", "Curing WIP"],
  ["CURED", "Cured Tube (Press)"],
  ["QC", "Quality Approved (Unpacked)"],
  ["FG", "Finished Goods"],
  ["STORE", "Packing Store"],
];

/** Departments that actually hold product PCS after a posted voucher. */
export const WIP_DEPARTMENTS = [
  ["EXTRUSION", "Green Tube"],
  ["CURED", "Cured Tube (Press)"],
  ["QC", "Quality Approved (Unpacked)"],
  ["FG", "Finished Goods"],
] as const;
