import { DashboardSkeleton, ShellSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <ShellSkeleton>
      <DashboardSkeleton />
    </ShellSkeleton>
  );
}
