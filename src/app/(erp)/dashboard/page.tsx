import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { DashboardClient } from "@/app/(erp)/dashboard/dashboard-client";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("dashboard.view")) {
    return (
      <ErpShell user={user} title="Dashboard" wide>
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  return (
    <ErpShell user={user} title="Dashboard" wide>
      <DashboardClient username={user.username} role={user.role} perms={perms} />
    </ErpShell>
  );
}