"use client";

import { useState } from "react";
import { Tabs } from "@/components/tabs";
import { DispatchClient } from "@/app/(erp)/dispatch/dispatch-client";
import { TransferClient } from "@/app/(erp)/stock/transfer-client";

type Tab = "dispatch" | "transfer";

/** The Dispatch page: sending goods to clients, and moving green tubes between sizes (Stock Transfer). */
export function DispatchTabs({ perms, initial }: { perms: string[]; initial?: string }) {
  const tabs = ([
    { id: "dispatch", label: "Dispatch", on: perms.some((k) => /^dispatch\.[a-z]+\.view$/.test(k)) },
    { id: "transfer", label: "Stock Transfer", on: perms.includes("stock.transfer.view") },
  ] as { id: Tab; label: string; on: boolean }[]).filter((t) => t.on);
  const [tab, setTab] = useState<Tab | undefined>(tabs.some((t) => t.id === initial) ? (initial as Tab) : tabs[0]?.id);

  function pick(t: Tab) {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      if (t === "dispatch") url.searchParams.delete("tab");
      else url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url);
    } catch {
      /* ignore */
    }
  }

  if (!tab) return <div className="erp-panel text-sm text-[#737373]">You have no Dispatch tab assigned. Ask an admin for access.</div>;
  return (
    <div className="space-y-4">
      {tabs.length > 1 && <Tabs tabs={tabs.map(({ id, label }) => ({ id, label }))} value={tab} onChange={pick} />}
      {tab === "dispatch" ? (
        <DispatchClient perms={perms} />
      ) : (
        <TransferClient canAdd={perms.includes("stock.transfer.add")} canDelete={perms.includes("stock.transfer.delete")} />
      )}
    </div>
  );
}
