import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { DispatchClient } from "@/app/(erp)/dispatch/dispatch-client";

export default async function DispatchPage() {
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
      <DispatchClient canPost={perms.includes("dispatch.post")} canClients={perms.includes("dispatch.clients")} canRemove={user.role === "admin"} />
    </ErpShell>
  );
}
