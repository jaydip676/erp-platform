import { getCurrentUser } from "@/lib/auth";
import { NoAccess } from "@/components/no-access";
import { isAdmin } from "@/lib/access";
import { SettingsClient } from "@/app/(erp)/settings/settings-client";

/** Admin-only: every plant-wide setting in one place. Not part of user permissions. */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      {isAdmin(user) ? <SettingsClient /> : <NoAccess />}
    </>
  );
}
