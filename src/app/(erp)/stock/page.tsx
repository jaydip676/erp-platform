import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { redirect } from "next/navigation";
import { StockClient } from "@/app/(erp)/stock/stock-client";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  // Stock Transfer moved to the Dispatch page; old links still land there.
  if ((await searchParams).tab === "transfer") redirect("/dispatch?tab=transfer");
  if (!perms.includes("stock.view")) {
    return (
      <ErpShell user={user} title="Department Stock">
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  return (
    <ErpShell user={user} title="Department Stock">
      <StockClient />
    </ErpShell>
  );
}
