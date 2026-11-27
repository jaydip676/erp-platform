import Link from "next/link";

/** Shown when a signed-in user opens a page or tab they were not given. */
export function NoAccess({ home }: { home?: string | null }) {
  return (
    <div className="erp-panel max-w-xl">
      <h2 className="text-lg font-semibold">No access</h2>
      <p className="erp-hint">You do not have permission to open this. Ask an admin to give you access.</p>
      {home && <Link className="erp-btn" href={home}>Go to my first page</Link>}
    </div>
  );
}
