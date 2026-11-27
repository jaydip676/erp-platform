import { PageSkeleton, ShellSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <ShellSkeleton>
      <PageSkeleton />
    </ShellSkeleton>
  );
}
