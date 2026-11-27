"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ErpNav } from "@/components/erp-nav";
import { LogoutButton } from "@/components/logout-button";

/**
 * Phones and tablets (below 1024px): a sticky top bar with the page title and a menu button
 * that slides the same sidebar menu in from the left. Desktop keeps the fixed sidebar.
 */
export function MobileNav({
  title,
  perms,
  admin,
  name,
  sub,
  initials,
}: {
  title: string;
  perms: string[];
  admin: boolean;
  name: string;
  sub: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after moving to another page.
  useEffect(() => setOpen(false), [pathname]);
  // Keep the page behind the menu from scrolling.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[#e5e5e5] bg-white/95 px-2 backdrop-blur lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[#171717] active:bg-[#f0f0f0]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="m-0 min-w-0 flex-1 truncate text-base font-semibold text-[#0a0a0a]">{title}</h1>
        <span className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#171717] text-xs font-semibold text-white" aria-hidden>
          {initials}
        </span>
      </div>

      <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} onClick={() => setOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col bg-[#f7f7f7] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#171717] text-sm font-bold text-white">D</span>
            <div className="flex-1 leading-tight">
              <div className="erp-brand">
                DEMO <span>ERP</span>
              </div>
              <div className="text-[11px] text-[#8a8a8a]">Production & Inventory</div>
            </div>
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-lg text-[#525252] active:bg-[#e8e8e8]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="-mx-1 mt-2 flex-1 overflow-y-auto px-1 pb-2 [&_a]:py-3 [&_a]:text-[15px]">
            <ErpNav perms={perms} admin={admin} />
          </div>
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-2.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#171717] text-xs font-semibold text-white">{initials}</span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-medium text-[#0a0a0a]">{name}</div>
                <div className="text-xs text-[#737373]">{sub}</div>
              </div>
            </div>
            <LogoutButton />
          </div>
        </aside>
      </div>
    </>
  );
}
