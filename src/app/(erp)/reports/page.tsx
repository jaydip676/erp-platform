import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { NoAccess } from "@/components/no-access";
import { getCurrentUser } from "@/lib/auth";
import { ReportsClient } from "@/app/(erp)/reports/reports-client";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = userPermissions(user);
  if (!perms.includes("reports.view")) {
    return (
      <>
        <NoAccess home={homePath(perms)} />
      </>
    );
  }
  return (
    <>
      <ReportsClient />
    </>
  );
}