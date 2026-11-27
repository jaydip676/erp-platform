import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ProcessClient } from "@/app/(erp)/process/process-client";

export default async function ProcessPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("process.view")) {
    return (
      <>
        <NoAccess home={homePath(perms)} />
      </>
    );
  }
  return (
    <>
      <ProcessClient perms={perms} allowed={(["extrusion", "curing", "inspection", "packing"] as const).filter((t) => perms.includes(`process.${t}.view`))} />
    </>
  );
}