import { readFileSync, writeFileSync } from "fs";

const text = readFileSync("/tmp/viaz-products.txt", "utf8");

const CATEGORIES = [
  "MOTOR CYCLE",
  "CAR (BIAS)",
  "CAR RADIAL",
  "SCV (BIAS)",
  "INDUSTRIAL/OTR",
  "TRACTOR FRONT",
  "LCV/ TR TRAILER",
  "BUS/TRUCK",
  "TRACTOR REAR",
  "OTR",
  "NATURAL RUBBER JOINTED TUBES",
  "NATURAL RUBBER MOULDED TUBES",
  "BUTYL RUBBER MOULDED BICYCLE TUBES",
  "BICYCLE TYRES",
  "ENGINE OILS (PER BOX)",
];

function kindFor(category: string) {
  if (category.includes("BICYCLE TYRE")) return "BICYCLE_TYRE";
  if (category.includes("BICYCLE") || category.includes("NATURAL RUBBER")) return "BICYCLE_TUBE";
  if (category.includes("ENGINE") || category.includes("GREASE") || category.includes("OIL")) return "LUBRICANT";
  return "FINISHED_TUBE";
}

function parsePack(packing: string) {
  const multi = packing.match(/(\d+)\s*[xX×]\s*(\d+)\s*=\s*(\d+)/);
  if (multi) {
    return {
      bagPcs: Number(multi[1]),
      bags: Number(multi[2]),
      domesticQty: Number(multi[3]),
      packing: `${multi[1]} × ${multi[2]} = ${multi[3]} pcs`,
    };
  }
  const box = packing.match(/1\s*BOX\s*=\s*(\d+)/i);
  if (box) {
    return { bagPcs: Number(box[1]), bags: 1, domesticQty: Number(box[1]), packing: `1 box = ${box[1]} pcs` };
  }
  const pcs = packing.match(/(\d+)\s*pcs/i);
  if (pcs) {
    return { bagPcs: Number(pcs[1]), bags: 1, domesticQty: Number(pcs[1]), packing: `${pcs[1]} pcs` };
  }
  return { bagPcs: null, bags: null, domesticQty: 0, packing: packing.trim() };
}

let category = "";
const items: {
  kind: string;
  category: string;
  srNo: number;
  size: string;
  valve: string;
  packing: string;
  bagPcs: number | null;
  bags: number | null;
  domesticQty: number;
  exportQty: number;
}[] = [];

for (const raw of text.split("\n")) {
  const line = raw.replace(/\s+$/g, "");
  const trimmed = line.trim();
  if (!trimmed) continue;
  const header = CATEGORIES.find((c) => trimmed === c || trimmed.replace(/\s+/g, " ") === c);
  if (header) {
    category = header;
    continue;
  }
  if (!category) continue;
  if (/^(SR\.NO|RANGE OF|VIAZ|www\.|TERM|Rate is|Payment|Management|Any kind|WIDE RANGE|REGISTERED|PLANT|E-mail|A HEART)/i.test(trimmed)) continue;

  const m = line.match(/^\s*(\d+)\s+(.+)$/);
  if (!m) continue;
  const srNo = Number(m[1]);
  let rest = m[2].trim();
  const asHeader = CATEGORIES.find((c) => rest.replace(/\s+/g, " ") === c);
  if (asHeader) {
    category = asHeader;
    continue;
  }

  let valve = "";
  let packing = "";
  const packMatch = rest.match(/((?:\d+\s*[xX×]\s*\d+\s*=\s*\d+\s*pcs)|(?:1\s*BOX\s*=\s*\d+\s*pcs)|(?:\d+\s*pcs))\s*$/i);
  if (packMatch) {
    packing = packMatch[1];
    rest = rest.slice(0, packMatch.index).trim();
  }

  if (kindFor(category) === "FINISHED_TUBE") {
    const valveMatch = rest.match(/^(.*?)\s{2,}([A-Z0-9][A-Z0-9./\- ]*)$/);
    if (valveMatch) {
      rest = valveMatch[1].trim();
      valve = valveMatch[2].replace(/\s+/g, " ").trim();
    }
  }

  const pack = parsePack(packing);
  items.push({
    kind: kindFor(category),
    category,
    srNo,
    size: rest.replace(/\s+/g, " ").trim(),
    valve,
    packing: pack.packing,
    bagPcs: pack.bagPcs,
    bags: pack.bags,
    domesticQty: pack.domesticQty,
    exportQty: pack.domesticQty,
  });
}

writeFileSync(
  new URL("../seed/catalog_from_pdf.json", import.meta.url),
  JSON.stringify(items, null, 2),
);
console.log("items", items.length);
const by = new Map<string, number>();
for (const i of items) by.set(i.category, (by.get(i.category) ?? 0) + 1);
console.log([...by.entries()]);
const bad = items.filter((i) => !i.size || !i.domesticQty);
console.log("incomplete", bad.length, bad.slice(0, 8));
