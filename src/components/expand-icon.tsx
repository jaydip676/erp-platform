/** Chevron for rows that open and close. Points down when closed and turns to point up when open. */
export function ExpandIcon({ open, size = "md" }: { open: boolean; size?: "sm" | "md" }) {
  const px = size === "sm" ? 14 : 16;
  return (
    <span className={`grid shrink-0 place-items-center text-[#525252] ${size === "sm" ? "h-6 w-6" : "h-7 w-7"}`} aria-hidden>
      <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
