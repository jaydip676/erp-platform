import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ErpShell } from "@/components/erp-shell";
import { ProcessClient } from "@/app/(erp)/process/process-client";

export default async function ProcessPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("process.view")) {
    return (
      <ErpShell user={user} title="Production Entry">
        <NoAccess home={homePath(perms)} />
      </ErpShell>
    );
  }
  return (
    <ErpShell user={user} title="Production Entry">
      <ProcessClient admin={user.role === "admin"} allowed={(["extrusion", "curing", "inspection", "packing"] as const).filter((t) => perms.includes(`process.${t}`))} />
    </ErpShell>
  );
}