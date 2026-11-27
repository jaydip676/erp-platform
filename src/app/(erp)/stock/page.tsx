import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { StockTabs } from "@/app/(erp)/stock/stock-tabs";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("stock.view")) {
    return (
      <ErpShell user={user} title="Department Stock">
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  const { tab } = await searchParams;
  return (
    <ErpShell user={user} title="Department Stock">
      <StockTabs
        isAdmin={user.role === "admin"}
        allowed={(["stock", "transfer"] as const).filter((t) => perms.includes(t === "stock" ? "stock.departments" : "stock.transfer"))}
        initial={tab === "transfer" ? "transfer" : "stock"}
      />
    </ErpShell>
  );
}
