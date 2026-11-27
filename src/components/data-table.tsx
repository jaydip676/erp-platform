import type { ReactNode } from "react";
import { SkeletonRows } from "@/components/skeleton";

type Cell = string | number | null | undefined | ReactNode;
type Props = {
  head: string[];
  rows: Cell[][];
  empty?: string;
  /** Show placeholder rows instead of the empty message while the data loads. */
  loading?: boolean;
};

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** Plain list table. Number cells are right-aligned and formatted (4,975.925). */
export function DataTable({ head, rows, empty = "Nothing to show yet.", loading = false }: Props) {
  const numeric = head.map((_, j) => rows.length > 0 && rows.every((r) => r[j] == null || r[j] === "" || typeof r[j] === "number"));
  return (
    <div className="overflow-x-auto">
      <table className="erp-table">
        <thead>
          <tr>
            {head.map((h, j) => (
              <th key={h} className={numeric[j] ? "text-right" : ""}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows rows={4} cols={head.length} />}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="py-6 text-center text-[#a3a3a3]">{empty}</td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={typeof c === "number" ? "text-right tabular-nums" : ""}>
                  {typeof c === "number" ? fmt.format(c) : (c ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
