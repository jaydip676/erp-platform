import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { userPermissions } from "@/lib/access";
import { homePath } from "@/lib/permissions";
import { ErpShell } from "@/components/erp-shell";
import { NoAccess } from "@/components/no-access";

/** Sends each user to the first page they may open. */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const home = homePath(userPermissions(user));
  if (home) redirect(home);
  if (user.role === "admin") redirect("/users");
  return (
    <ErpShell user={user} title="Welcome">
      <NoAccess />
    </ErpShell>
  );
}
