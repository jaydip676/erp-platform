/** The plant runs on India time. "Today" must come from there, not from UTC (which is a day behind until 5:30 AM). */
export const PLANT_TZ = "Asia/Kolkata";

/** Today's date at the plant as YYYY-MM-DD. Works the same in the browser and on the server. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PLANT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** YYYY-MM-DD -> DD-MM-YYYY for display. */
export function showDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}-${m}-${y}` : iso;
}
