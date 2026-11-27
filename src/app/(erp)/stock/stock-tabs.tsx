"use client";

import { useState } from "react";
import { Tabs } from "@/components/tabs";
import { StockClient } from "@/app/(erp)/stock/stock-client";
import { TransferClient } from "@/app/(erp)/stock/transfer-client";

type Tab = "stock" | "transfer";

export function StockTabs({ canEdit = false, canDelete = false, initial, allowed = ["stock", "transfer"] }: { canEdit?: boolean; canDelete?: boolean; initial: Tab; allowed?: Tab[] }) {
  const [tab, setTab] = useState<Tab>(allowed.includes(initial) ? initial : (allowed[0] ?? "stock"));
  const [version, setVersion] = useState(0);
  const change = (t: Tab) => {
    setTab(t);
    setVersion((n) => n + 1);
    try {
      const url = new URL(window.location.href);
      if (t === "stock") url.searchParams.delete("tab");
      else url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url);
    } catch {
      /* ignore */
    }
  };
  if (allowed.length === 0) return <div className="erp-panel text-sm text-[#737373]">You have no Department Stock tab assigned. Ask an admin for access.</div>;
  return (
    <div className="space-y-4">
      <Tabs
        tabs={([
          { id: "stock", label: "Department Stock" },
          { id: "transfer", label: "Green Tube Transfer" },
        ] as { id: Tab; label: string }[]).filter((t) => allowed.includes(t.id))}
        value={tab}
        onChange={change}
      />
      {tab === "stock" ? <StockClient key={version} /> : <TransferClient canEdit={canEdit} canDelete={canDelete} />}
    </div>
  );
}
