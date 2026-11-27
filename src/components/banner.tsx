/** Green or red message shown after saving or posting. */
export function Banner({ ok, warn = false, children, onClose }: { ok: boolean; warn?: boolean; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`mt-3 flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${warn ? "border-amber-200 bg-amber-50 text-amber-900" : ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-800"}`}
    >
      <span className="flex gap-2">
        <span aria-hidden className="font-bold">{warn ? "⚠" : ok ? "✓" : "!"}</span>
        <span>{children}</span>
      </span>
      {onClose && (
        <button type="button" aria-label="Dismiss" onClick={onClose} className="shrink-0 text-base leading-none opacity-60 hover:opacity-100">×</button>
      )}
    </div>
  );
}
