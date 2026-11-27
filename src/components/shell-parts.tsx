"use client";

import { usePathname } from "next/navigation";
import { isWidePage, pageTitle } from "@/lib/page-titles";

/** The page title in the desktop header. It follows the page, so the frame around it never reloads. */
export function ShellTitle({ title }: { title?: string }) {
  const pathname = usePathname();
  return <h1 className="m-0 text-base font-semibold tracking-tight text-[#0a0a0a]">{title ?? pageTitle(pathname)}</h1>;
}

/** The content area: full width on Dashboard and Masters, a readable width elsewhere. */
export function ShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className={`px-3 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pt-4 ${isWidePage(pathname) ? "lg:p-5" : "max-w-[1500px] lg:p-6"}`}>
      {children}
    </div>
  );
}
