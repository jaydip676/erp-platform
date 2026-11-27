"use client";

/** The app's tabs: black pills for page tabs; size "sm" is a grey segmented switch for tabs inside a page tab. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
  size = "md",
}: {
  size?: "md" | "sm";
  tabs: { id: T; label: string; count?: number; dot?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  // Inner tabs (size "sm"): a grey segmented switch, so they never look like the page tabs above them.
  if (size === "sm") {
    return (
      <div className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[#e5e5e5] bg-[#f4f4f5] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`} role="tablist">
        {tabs.map((t) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors lg:py-1.5 ${
                on ? "bg-white text-[#171717] shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-[#737373] hover:text-[#171717]"
              }`}
            >
              {t.label}
              {t.count != null && <span className="ml-1.5 text-xs text-[#a3a3a3]">{t.count}</span>}
              {t.dot && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle" title="Unsaved changes" />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    // Phones: one row that scrolls sideways. Desktop: wraps as before.
    <div className={`-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-4 sm:px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden ${className}`} role="tablist">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-full border font-semibold transition-colors px-4 py-2.5 text-sm lg:py-2 ${
              on ? "border-[#171717] bg-[#171717] text-white" : "border-[#e5e5e5] bg-white text-[#737373] hover:bg-[#f5f5f5] hover:text-[#171717]"
            }`}
          >
            {t.label}
            {t.count != null && <span className={`ml-1.5 text-xs ${on ? "text-white/70" : "text-[#a3a3a3]"}`}>{t.count}</span>}
            {t.dot && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle" title="Unsaved changes" />}
          </button>
        );
      })}
    </div>
  );
}
