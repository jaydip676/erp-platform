import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { RejectionsClient } from "@/app/(erp)/rejections/rejections-client";

export default async function RejectionsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("rejections.view")) {
    return (
      <ErpShell user={user} title="Rejection Register">
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  return (
    <ErpShell user={user} title="Rejection Register">
      <RejectionsClient />
    </ErpShell>
  );
}