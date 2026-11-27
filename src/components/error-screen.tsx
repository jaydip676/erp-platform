"use client";

import Link from "next/link";

/** Shown in place of a page when something breaks or is missing. */
export function ErrorScreen({
  title,
  text,
  onRetry,
  code,
}: {
  title: string;
  text: string;
  onRetry?: () => void;
  code?: string;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[#e5e5e5] bg-white p-6 text-center shadow-sm">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-rose-50 text-rose-600" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 8v5M12 16.5h.01" />
            <circle cx="12" cy="12" r="9.5" strokeWidth="2" />
          </svg>
        </span>
        <h1 className="mt-3 text-lg font-semibold text-[#0a0a0a]">{title}</h1>
        <p className="mt-1 text-sm text-[#737373]">{text}</p>
        {code && <p className="mt-2 font-mono text-[11px] text-[#a3a3a3]">Ref: {code}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center [&>*]:m-0">
          <Link href="/" className="erp-btn erp-btn-secondary mt-0 text-center no-underline">Go to home</Link>
          {onRetry && (
            <button type="button" className="erp-btn mt-0" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
