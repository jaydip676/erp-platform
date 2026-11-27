/** Grey placeholder blocks shown while data loads. They follow the same layout as the real screens. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`rounded-md bg-[#ececec] motion-safe:animate-pulse ${className}`} />;
}

/** Table body rows. Use inside <tbody> while a list loads. */
export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="py-3">
              <Skeleton className={`h-4 ${c === 0 ? "w-3/4" : c === cols - 1 ? "ml-auto w-1/2" : "w-2/3"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A whole table card: heading, then rows. */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading" className="overflow-hidden rounded-lg border border-[#e5e5e5]">
      <div className="flex gap-4 border-b border-[#e5e5e5] bg-[#fafafa] px-3 py-3">
        {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-3 flex-1" />)}
      </div>
      <table className="erp-table m-0"><tbody><SkeletonRows rows={rows} cols={cols} /></tbody></table>
    </div>
  );
}

/** A form card: title, a row of inputs and a button. */
export function SkeletonPanel({ fields = 3 }: { fields?: number }) {
  return (
    <div role="status" aria-label="Loading" className="erp-panel">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-3 h-3 w-full max-w-xl" />
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i}>
            <Skeleton className="mb-2 h-3 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-5 h-10 w-36" />
    </div>
  );
}

/** What most pages look like: a tab row, a form card and a list. */
export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-hidden">
        {["w-28", "w-36", "w-32", "w-40"].map((w) => <Skeleton key={w} className={`h-9 shrink-0 rounded-full ${w}`} />)}
      </div>
      <SkeletonPanel />
      <div className="erp-panel">
        <Skeleton className="mb-3 h-5 w-32" />
        <SkeletonTable rows={5} cols={4} />
      </div>
    </div>
  );
}

/** The dashboard: a row of figures, then two cards. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="erp-panel">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="erp-panel"><Skeleton className="mb-4 h-5 w-40" /><Skeleton className="h-48 w-full" /></div>
        <div className="erp-panel"><Skeleton className="mb-4 h-5 w-32" /><SkeletonTable rows={5} cols={3} /></div>
      </div>
    </div>
  );
}

/** The app frame (menu on the left, title bar on top) with placeholders, while the page itself loads. */
export function ShellSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#e5e5e5] bg-white px-4 lg:hidden">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="ml-auto h-8 w-8 rounded-full" />
      </div>
      <aside aria-hidden className="fixed inset-y-0 left-0 hidden w-[240px] flex-col px-3 py-3 lg:flex">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#171717] text-sm font-bold text-white">V</span>
          <div className="leading-tight">
            <div className="erp-brand">VIAZ <span>TYRES</span></div>
            <div className="text-[11px] text-[#8a8a8a]">Manufacturing ERP</div>
          </div>
        </div>
        <div className="mt-4 flex-1 space-y-2 px-1">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-2.5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-12" /></div>
          </div>
        </div>
      </aside>
      <main className="lg:ml-[240px] lg:p-2 lg:pl-0">
        <div className="min-h-[calc(100dvh-3.5rem)] bg-white lg:min-h-[calc(100vh-1rem)] lg:rounded-xl lg:border lg:border-[#e5e5e5] lg:shadow-sm">
          <header className="hidden h-14 items-center border-b border-[#e5e5e5] px-6 lg:flex">
            <Skeleton className="h-5 w-40" />
          </header>
          <div className="max-w-[1500px] px-3 pb-6 pt-3 sm:px-4 sm:pt-4 lg:p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
