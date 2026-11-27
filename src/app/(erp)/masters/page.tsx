import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { MastersTabs } from "@/app/(erp)/masters/masters-tabs";

export default async function MastersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("masters.view")) {
    return (
      <ErpShell user={user} title="Masters" wide>
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  const { tab } = await searchParams;
  return (
    <ErpShell user={user} title="Masters" wide>
      <MastersTabs perms={perms} initial={tab} admin={user.role === "admin"} />
    </ErpShell>
  );
}
