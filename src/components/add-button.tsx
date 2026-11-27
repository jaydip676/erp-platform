/** The "+ New …" button that opens a create popup on a Masters tab. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="erp-btn mt-0 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap max-lg:!h-10 max-lg:!px-3.5 max-lg:!text-sm" onClick={onClick}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </button>
  );
}
