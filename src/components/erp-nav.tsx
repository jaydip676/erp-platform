"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Icon = "users" | "dashboard" | "layers" | "award" | "package" | "boxes" | "flask" | "list" | "inbox" | "blend" | "factory" | "warehouse" | "x" | "file" | "receipt" | "database" | "truck" | "settings";

const operations: { href: string; label: string; icon: Icon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/materials", label: "Inward Material", icon: "inbox" },
  { href: "/mixing", label: "Mixing Department", icon: "blend" },
  { href: "/process", label: "Production", icon: "factory" },
  { href: "/stock", label: "Department Stock", icon: "warehouse" },
  { href: "/dispatch", label: "Dispatch", icon: "truck" },
  { href: "/rejections", label: "Rejections", icon: "x" },
  { href: "/reports", label: "Daily Report", icon: "file" },
  { href: "/vouchers", label: "Vouchers", icon: "receipt" },
];

const masters: { href: string; label: string; icon: Icon }[] = [
  { href: "/masters", label: "Masters", icon: "boxes" },
];

const PATHS: Record<Icon, string[]> = {
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  dashboard: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  layers: ["M12 2 2 7l10 5 10-5-10-5Z", "m2 17 10 5 10-5", "m2 12 10 5 10-5"],
  award: ["M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "m8.2 13.9-1.2 8.1 5-3 5 3-1.2-8.1"],
  package: ["m7.5 4.3 9 5.2", "M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Z", "m3.3 7 8.7 5 8.7-5", "M12 22V12"],
  boxes: ["M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z", "m7 16.5-4.74-2.85", "m7 16.5 5-3", "M7 16.5v5.17", "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z", "m17 16.5-5-3", "m17 16.5 4.74-2.85", "M17 16.5v5.17", "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z", "M12 8 7.26 5.15", "m12 8 4.74-2.85", "M12 13.5V8"],
  flask: ["M10 2v7.5L4.6 18.6A2 2 0 0 0 6.3 21.6h11.4a2 2 0 0 0 1.7-3L14 9.5V2", "M8.5 2h7", "M7 16h10"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"],
  blend: ["M3 6a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v4a3 3 0 0 0 3 3h2", "M21 13v5a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-4a3 3 0 0 0-3-3H6"],
  factory: ["M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z", "M17 18h1", "M12 18h1", "M7 18h1"],
  warehouse: ["M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z", "M6 18h12", "M6 14h12", "M6 10h12"],
  x: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "m15 9-6 6", "m9 9 6 6"],
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8"],
  receipt: ["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z", "M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8", "M12 17.5v-11"],
  truck: ["M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", "M15 18H9", "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14", "M17 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z", "M3 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"],
  settings: ["M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  database: ["M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3Z", "M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5", "M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"],
};

export function NavIcon({ name }: { name: Icon }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function Item({ href, label, icon, pathname }: { href: string; label: string; icon: Icon; pathname: string }) {
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active ? "bg-[#e8e8e8] font-medium text-[#0a0a0a]" : "text-[#525252] hover:bg-[#eeeeee] hover:text-[#0a0a0a]"
      }`}
    >
      <NavIcon name={icon} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Group({ label }: { label: string }) {
  return <p className="px-3 pb-1 pt-4 text-xs font-medium text-[#8a8a8a]">{label}</p>;
}

/** The menu shows only the pages this user may open. */
export function ErpNav({ perms, admin }: { perms: string[]; admin: boolean }) {
  const pathname = usePathname();
  const allowed = (href: string) => perms.includes(`${href.slice(1)}.view`);
  const ops = operations.filter((l) => allowed(l.href));
  const overview = ops.filter((l) => l.href === "/dashboard");
  const work = ops.filter((l) => l.href !== "/dashboard");
  const mast = masters.filter((l) => allowed(l.href));
  return (
    <nav className="space-y-0.5">
      {overview.length > 0 && <Group label="Overview" />}
      {overview.map((l) => (
        <Item key={l.href} {...l} pathname={pathname} />
      ))}
      {mast.length > 0 && <Group label="Masters" />}
      {mast.map((l) => (
        <Item key={l.href} {...l} pathname={pathname} />
      ))}
      {work.length > 0 && <Group label="Operations" />}
      {work.map((l) => (
        <Item key={l.href} {...l} pathname={pathname} />
      ))}
      {admin && (
        <>
          <Group label="Admin" />
          <Item href="/users" label="Users & Permissions" icon="users" pathname={pathname} />
          <Item href="/settings" label="Settings" icon="settings" pathname={pathname} />
        </>
      )}
    </nav>
  );
}
