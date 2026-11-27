"use client";

import { useRef } from "react";

const show = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};

/**
 * The app's date box: dd/mm/yyyy with a calendar icon on the right, the same on every browser and phone.
 * A real date input sits invisibly on top, so tapping anywhere opens the device's own date picker.
 * Takes the same props as <input type="date"> (value is YYYY-MM-DD).
 */
export function DateInput({
  className = "erp-input",
  value,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & { value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = ref.current;
    if (!el || el.disabled) return;
    try {
      el.showPicker?.();
    } catch {
      /* some browsers only open it from a direct tap, which the input on top already handles */
    }
  };
  return (
    <div
      className={`erp-date relative flex items-center justify-between gap-2 tabular-nums ${rest.disabled ? "erp-date-disabled" : ""} ${className}`}
      onClick={open}
    >
      <span className={value ? "text-[#0a0a0a]" : "text-[#a3a3a3]"}>{value ? show(value) : "dd/mm/yyyy"}</span>
      <svg className="shrink-0 text-[#171717]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </svg>
      <input
        {...rest}
        ref={ref}
        type="date"
        value={value}
        className="erp-date-native absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
