import { getCurrentUser } from "@/lib/auth";
import { NoAccess } from "@/components/no-access";
import { isAdmin } from "@/lib/access";
import { UsersClient } from "@/app/(erp)/users/users-client";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      {isAdmin(user) ? <UsersClient meId={user.id} /> : <NoAccess />}
    </>
  );
}
