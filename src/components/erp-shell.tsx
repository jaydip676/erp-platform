import { ErpNav } from "@/components/erp-nav";
import { LogoutButton } from "@/components/logout-button";
import { NumberWheelGuard } from "@/components/number-wheel-guard";
import { ConfirmProvider } from "@/components/confirm";
import { MobileNav } from "@/components/mobile-nav";
import { isAdmin, userPermissions } from "@/lib/access";
import { entryWindow } from "@/lib/erp/rights";
import { EntryWindowProvider } from "@/components/entry-window";
import { ShellBody, ShellTitle } from "@/components/shell-parts";

type Props = {
  user: { username: string; role: string; displayName?: string | null; entryDays?: number | null };
  /** Fixed title. Left out inside the app, where the title follows the page. */
  title?: string;
  children: React.ReactNode;
};

/**
 * The app frame: sidebar, mobile bar and header. It is rendered once by the app layout and stays
 * in place while moving between pages; only the content inside it changes.
 */
export function ErpShell({ user, title, children }: Props) {
  const initials = (user.displayName || user.username).slice(0, 2).toUpperCase();
  const perms = userPermissions(user);
  const admin = isAdmin(user);
  const name = user.displayName || user.username;
  const sub = `${admin ? "Admin" : "User"}${user.displayName ? ` · ${user.username}` : ""}`;
  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <NumberWheelGuard />
      <MobileNav title={title} perms={perms} admin={admin} name={name} sub={sub} initials={initials} />
      <aside className="fixed inset-y-0 left-0 hidden w-[240px] flex-col px-3 py-3 lg:flex">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#171717] text-sm font-bold text-white">N</span>
          <div className="leading-tight">
            <div className="erp-brand">
              NIVA <span>ERP</span>
            </div>
            <div className="text-[11px] text-[#8a8a8a]">Production & Inventory</div>
          </div>
        </div>
        <div className="-mx-1 mt-2 flex-1 overflow-y-auto px-1 pb-2">
          <ErpNav perms={perms} admin={admin} />
        </div>
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-2.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#171717] text-xs font-semibold text-white">{initials}</span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium text-[#0a0a0a]">{user.displayName || user.username}</div>
              <div className="text-xs text-[#737373]">{admin ? "Admin" : "User"}{user.displayName ? ` · ${user.username}` : ""}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="lg:ml-[240px] lg:p-2 lg:pl-0">
        <div className="min-h-[calc(100dvh-3.5rem)] bg-white lg:min-h-[calc(100vh-1rem)] lg:rounded-xl lg:border lg:border-[#e5e5e5] lg:shadow-sm">
          <header className="hidden h-14 items-center border-b border-[#e5e5e5] px-6 lg:flex">
            <ShellTitle title={title} />
          </header>
          <ShellBody>
            <EntryWindowProvider value={entryWindow(user)}>
              <ConfirmProvider>{children}</ConfirmProvider>
            </EntryWindowProvider>
          </ShellBody>
        </div>
      </main>
    </div>
  );
}
