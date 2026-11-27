/**
 * Row action (Edit, Delete, Remove…). Phones and tablets: an icon-only button with a large tap area.
 * Desktop: the icon with its word next to it.
 */
type Kind = "edit" | "delete" | "disable" | "enable";

const PATHS: Record<Kind, string[]> = {
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"],
  delete: ["M3 6h18", "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M10 11v6", "M14 11v6"],
  disable: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "m4.9 4.9 14.2 14.2"],
  enable: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "m9 12 2 2 4-4"],
};

export function IconAction({ kind, label, onClick, disabled }: { kind: Kind; label: string; onClick: () => void; disabled?: boolean }) {
  const danger = kind === "delete" || kind === "disable";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 max-lg:h-10 max-lg:w-10 lg:h-8 lg:px-2.5 ${
        danger ? "text-[#dc2626] hover:bg-[#fef2f2] active:bg-[#fef2f2]" : "text-[#404040] hover:bg-[#f4f4f5] active:bg-[#f4f4f5]"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {PATHS[kind].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <span className="max-lg:hidden">{label}</span>
    </button>
  );
}
