import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { NoAccess } from "@/components/no-access";
import { isAdmin } from "@/lib/access";
import { UsersClient } from "@/app/(erp)/users/users-client";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <ErpShell user={user} title="Users & Permissions">
      {isAdmin(user) ? <UsersClient meId={user.id} /> : <NoAccess />}
    </ErpShell>
  );
}
