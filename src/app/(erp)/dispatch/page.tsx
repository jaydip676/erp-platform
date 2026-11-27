import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { DispatchTabs } from "@/app/(erp)/dispatch/dispatch-tabs";

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("dispatch.view")) {
    return (
      <ErpShell user={user} title="Dispatch">
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  return (
    <ErpShell user={user} title="Dispatch">
      <DispatchTabs perms={perms} initial={(await searchParams).tab} />
    </ErpShell>
  );
}
