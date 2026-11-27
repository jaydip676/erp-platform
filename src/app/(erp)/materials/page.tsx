import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { MaterialsClient } from "@/app/(erp)/materials/materials-client";

export default async function MaterialsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("materials.view")) {
    return (
      <>
        <NoAccess home={homePath(perms)} />
      </>
    );
  }
  return (
    <>
      <MaterialsClient admin={user.role === "admin"} perms={perms} allowed={(["RAW", "STORE", "POUCH"] as const).filter((t) => perms.includes(`materials.${t.toLowerCase()}.view`))} />
    </>
  );
}