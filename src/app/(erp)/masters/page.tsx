import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { MastersTabs } from "@/app/(erp)/masters/masters-tabs";

export default async function MastersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("masters.view")) {
    return (
      <>
        <NoAccess home={homePath(perms)} />
      </>
    );
  }
  const { tab } = await searchParams;
  return (
    <>
      <MastersTabs perms={perms} initial={tab} admin={user.role === "admin"} />
    </>
  );
}
