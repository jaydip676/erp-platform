import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageSkeleton, ShellSkeleton } from "@/components/skeleton";

/** Checks the sign-in. While that (and the page) loads, the app frame is shown as placeholders. */
async function Gate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return children;
}

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton><PageSkeleton /></ShellSkeleton>}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
