/** Title shown in the app bar for each page, and which pages use the full width. */
export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/materials": "Inward Material",
  "/mixing": "Mixing Department",
  "/process": "Production Entry",
  "/stock": "Department Stock",
  "/dispatch": "Dispatch",
  "/rejections": "Rejection Register",
  "/reports": "Daily Report",
  "/vouchers": "Vouchers",
  "/masters": "Masters",
  "/users": "Users & Permissions",
  "/settings": "Settings",
};
const WIDE = ["/dashboard", "/masters"];

const section = (pathname: string) => "/" + (pathname.split("/")[1] ?? "");
export const pageTitle = (pathname: string, fallback = "Niva ERP") => PAGE_TITLES[section(pathname)] ?? fallback;
export const isWidePage = (pathname: string) => WIDE.includes(section(pathname));
