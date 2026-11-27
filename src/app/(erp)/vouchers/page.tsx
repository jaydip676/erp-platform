import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { VouchersClient } from "@/app/(erp)/vouchers/vouchers-client";

export default async function VouchersPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("vouchers.view")) {
    return (
      <ErpShell user={user} title="Vouchers">
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  return (
    <ErpShell user={user} title="Vouchers">
      <VouchersClient perms={perms} />
    </ErpShell>
  );
}