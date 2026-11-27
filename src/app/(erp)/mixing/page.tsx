import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { MixingClient } from "@/app/(erp)/mixing/mixing-client";

export default async function MixingPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("mixing.view")) {
    return (
      <ErpShell user={user} title="Mixing Department">
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  return (
    <ErpShell user={user} title="Mixing Department">
      <MixingClient isAdmin={user.role === "admin"} allowed={(["master", "final"] as const).filter((t) => perms.includes(`mixing.${t}`))} />
    </ErpShell>
  );
}