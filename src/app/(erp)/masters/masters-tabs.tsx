"use client";

import { Tabs } from "@/components/tabs";
import { useState } from "react";
import { InventoryClient } from "@/app/(erp)/masters/inventory/inventory-client";
import { BatchesClient } from "@/app/(erp)/masters/batches/batches-client";
import { CodeNameClient } from "@/app/(erp)/masters/code-name-client";
import { PackingClient } from "@/app/(erp)/masters/packing/packing-client";
import { ProductsClient } from "@/app/(erp)/products/products-client";
import { OpeningClient } from "@/app/(erp)/opening/opening-client";

const TABS = [
  ["items", "Item Master"],
  ["products", "Product List"],
  ["batches", "Batch Master"],
  ["packing", "Auto Consumption Packing"],
  ["groups", "Group Entry"],
  ["qualities", "Quality (Grade)"],
  ["opening", "Opening Stock"],
] as const;
type Tab = (typeof TABS)[number][0];

const PERM: Record<Tab, string> = {
  items: "masters.items",
  products: "masters.products",
  batches: "masters.batches",
  packing: "masters.packing",
  groups: "masters.groups",
  qualities: "masters.qualities",
  opening: "masters.opening",
};

/** Each tab shows only with its "view" permission; Add, Edit and Delete each unlock their own controls. */
export function MastersTabs({ perms, initial, admin = false }: { perms: string[]; initial?: string; admin?: boolean }) {
  const tabs = TABS.filter(([id]) => perms.includes(`${PERM[id]}.view`));
  const [tab, setTab] = useState<Tab | undefined>(tabs.some(([id]) => id === initial) ? (initial as Tab) : tabs[0]?.[0]);
  const edit = (id: Tab) => perms.includes(`${PERM[id]}.edit`);
  const del = (id: Tab) => perms.includes(`${PERM[id]}.delete`);
  const add = (id: Tab) => perms.includes(`${PERM[id]}.add`);

  function pick(id: Tab) {
    setTab(id);
    window.history.replaceState(null, "", `/masters?tab=${id}`);
  }

  if (!tab) return <div className="erp-panel text-sm text-[#737373]">You have no Masters tab assigned. Ask an admin for access.</div>;

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs.map(([id, label]) => ({ id, label }))} value={tab} onChange={pick} />
      {tab === "items" && <InventoryClient isAdmin={edit("items")} canAdd={add("items")} canDelete={del("items")} />}
      {tab === "products" && <ProductsClient isAdmin={edit("products")} canAdd={add("products")} canDelete={del("products")} />}
      {tab === "batches" && <BatchesClient isAdmin={edit("batches")} canAdd={add("batches")} canDelete={del("batches")} />}
      {tab === "packing" && <PackingClient isAdmin={edit("packing")} canDelete={del("packing")} admin={admin} />}
      {tab === "opening" && <OpeningClient isAdmin={add("opening")} canDelete={del("opening")} />}
      {tab === "groups" && (
        <CodeNameClient
          isAdmin={edit("groups")}
          canAdd={add("groups")}
          canDelete={del("groups")}
          title="Group Entry"
          hint="Groups used on Item Master. Raw Material, Finished Goods, and Store Item are already entered. Add a group here before using it on an item."
          endpoint="/api/masters/groups"
        />
      )}
      {tab === "qualities" && (
        <CodeNameClient
          isAdmin={edit("qualities")}
          canAdd={add("qualities")}
          canDelete={del("qualities")}
          title="Quality (Grade) Entry"
          hint="Each grade is a brand, such as cvaz, viaz, or jkc. On Auto Consumption Packing, brand is only for Pouch, Small Pouch, and Big Pouch."
          endpoint="/api/masters/qualities"
        />
      )}
    </div>
  );
}
