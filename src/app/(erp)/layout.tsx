import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageSkeleton, ShellSkeleton } from "@/components/skeleton";
import { ErpShell } from "@/components/erp-shell";

/**
 * Checks the sign-in and draws the app frame (sidebar, bars) once. Moving to another page keeps the
 * frame as it is and only swaps the content, which shows its own loading placeholder.
 */
async function Gate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ErpShell user={user}>{children}</ErpShell>;
}

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton><PageSkeleton /></ShellSkeleton>}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
