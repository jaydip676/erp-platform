import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#f7f7f7] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#e5e5e5] bg-white p-6 text-center shadow-sm">
        <div className="text-4xl font-bold tracking-tight text-[#0a0a0a]">404</div>
        <h1 className="mt-2 text-lg font-semibold text-[#0a0a0a]">Page not found</h1>
        <p className="mt-1 text-sm text-[#737373]">This page does not exist or was moved.</p>
        <Link href="/" className="erp-btn mt-5 inline-block no-underline">Go to home</Link>
      </div>
    </div>
  );
}
