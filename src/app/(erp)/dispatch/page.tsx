import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { DispatchTabs } from "@/app/(erp)/dispatch/dispatch-tabs";

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("dispatch.view")) {
    return (
      <>
        <NoAccess home={homePath(perms)} />
      </>
    );
  }
  return (
    <>
      <DispatchTabs perms={perms} initial={(await searchParams).tab} />
    </>
  );
}
