import { PageSkeleton } from "@/components/skeleton";

/** Only the page content loads; the sidebar and bars stay as they are. */
export default function Loading() {
  return <PageSkeleton />;
}
