"use client";

import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScrollLock } from "@/lib/use-scroll-lock";

type Opt = { kind: "option"; value: string; label: string; disabled: boolean; group?: string };
type Group = { kind: "group"; label: string };
type Item = Opt | Group;

/** Text of an <option>'s children ("10020", ["MASTER V2", " · ", 119.83, " KG"] …). */
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

/** Reads <option> and <optgroup> children (also inside arrays, fragments and conditions). */
function readItems(children: React.ReactNode, group?: string, out: Item[] = []): Item[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: unknown; disabled?: boolean; label?: string; children?: React.ReactNode };
    if (child.type === Fragment) readItems(props.children, group, out);
    else if (child.type === "optgroup") {
      out.push({ kind: "group", label: props.label ?? "" });
      readItems(props.children, props.label ?? "", out);
    } else if (child.type === "option") {
      const label = textOf(props.children);
      out.push({ kind: "option", value: props.value === undefined ? label : String(props.value), label, disabled: !!props.disabled, group });
    }
  });
  return out;
}

export type SelectChange = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

type Props = {
  value?: string | number;
  onChange?: (e: SelectChange) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  title?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
};

const SEARCH_FROM = 9;

/**
 * The app's dropdown, used instead of the browser's own <select>. Same props and <option> children,
 * and onChange gives e.target.value like a native select. Desktop: a list under the box (above it when
 * there is no room). Phones: a sheet from the bottom. Long lists get a search box.
 */
export function Select({ value, onChange, children, className = "erp-input", disabled, id, name, title, style, "aria-label": ariaLabel }: Props) {
  const items = useMemo(() => readItems(children), [children]);
  const options = useMemo(() => items.filter((i): i is Opt => i.kind === "option"), [items]);
  const current = options.find((o) => o.value === String(value ?? "")) ?? options[0];

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; maxH: number } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [heading, setHeading] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const hit = options.filter((o) => o.label.toLowerCase().includes(q));
    return hit as Item[];
  }, [items, options, query]);
  const shownOptions = shown.filter((i): i is Opt => i.kind === "option" && !i.disabled);

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 220 && above > below;
    setPos({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 180), up, maxH: Math.min(320, Math.max(160, (up ? above : below) - 4)) });
  }, []);

  function show() {
    if (disabled || options.length === 0) return;
    setMobile(window.matchMedia("(max-width: 639px)").matches);
    // Sheet title on phones: the field's label ("Size", "Valve"…), from the <label> around the box.
    const lab = trigger.current?.closest("label");
    const own = lab ? [...lab.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join(" ").trim() : "";
    setHeading(ariaLabel || own);
    setQuery("");
    setActive(current?.value ?? null);
    place();
    setOpen(true);
  }
  function close(focus = true) {
    setOpen(false);
    if (focus) trigger.current?.focus();
  }
  function pick(o: Opt) {
    if (o.disabled) return;
    close();
    if (o.value !== String(value ?? "")) {
      const t = { value: o.value, name };
      onChange?.({ target: t, currentTarget: t });
    }
  }

  // Follow the box while the page scrolls; close when clicking elsewhere.
  useLayoutEffect(() => {
    if (!open || mobile) return;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, mobile, place]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || trigger.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);
  // Keep the highlighted option in view, and put the cursor in the search box on desktop.
  useEffect(() => {
    if (!open) return;
    if (!mobile && options.length >= SEARCH_FROM) search.current?.focus();
    const el = panel.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(active ?? "")}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active, mobile, options.length]);

  function move(step: number) {
    if (shownOptions.length === 0) return;
    const i = shownOptions.findIndex((o) => o.value === active);
    const next = shownOptions[(i + step + shownOptions.length) % shownOptions.length] ?? shownOptions[0];
    setActive(next.value);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActive(shownOptions[0]?.value ?? null); }
    else if (e.key === "End") { e.preventDefault(); setActive(shownOptions[shownOptions.length - 1]?.value ?? null); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const o = shownOptions.find((x) => x.value === active) ?? shownOptions[0];
      if (o) pick(o);
    } else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close(false);
    else if (options.length < SEARCH_FROM && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Short lists: type the first letters to jump to an option.
      const now = e.timeStamp;
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = shownOptions.find((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit) setActive(hit.value);
    }
  }

  const list = (
    <div role="listbox" id={listId} aria-label={ariaLabel} className="overflow-y-auto overscroll-contain p-1" style={mobile ? undefined : { maxHeight: (pos?.maxH ?? 320) - (options.length >= SEARCH_FROM ? 52 : 0) }}>
      {shown.length === 0 && <div className="px-3 py-6 text-center text-sm text-[#a3a3a3]">No match</div>}
      {shown.map((it, i) =>
        it.kind === "group" ? (
          <div key={`g-${i}`} className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#a3a3a3]">{it.label}</div>
        ) : (
          <div
            key={`o-${it.value}-${i}`}
            role="option"
            data-value={it.value}
            aria-selected={it.value === current?.value}
            aria-disabled={it.disabled}
            onMouseEnter={() => !it.disabled && setActive(it.value)}
            onClick={() => pick(it)}
            className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-[14px] max-sm:py-3 sm:py-2 ${
              it.disabled ? "cursor-not-allowed text-[#c4c4c4]" : it.value === active ? "bg-[#f4f4f5] text-[#0a0a0a]" : "text-[#262626]"
            } ${it.value === current?.value ? "font-semibold" : ""}`}
          >
            <span className="min-w-0 break-words">{it.label || " "}</span>
            {it.value === current?.value && (
              <svg className="shrink-0 text-[#171717]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12l5 5L20 7" />
              </svg>
            )}
          </div>
        ),
      )}
    </div>
  );

  const searchBox = options.length >= SEARCH_FROM && (
    <div className="border-b border-[#f0f0f0] p-1.5">
      <input
        ref={search}
        className="h-9 w-full rounded-md border border-[#e5e5e5] bg-[#fafafa] px-3 text-[16px] outline-none focus:border-[#171717] sm:text-[14px]"
        placeholder="Search…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(null);
        }}
        onKeyDown={onKey}
      />
    </div>
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        title={title}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
        className={`erp-select flex items-center justify-between gap-2 text-left ${className}`}
        style={style}
      >
        <span className={`min-w-0 truncate ${current && current.value !== "" ? "" : "text-[#737373]"}`}>{current?.label ?? ""}</span>
        <svg className={`shrink-0 text-[#737373] transition-transform duration-150 ${open ? "rotate-180" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open &&
        createPortal(
          mobile ? (
            <div className="fixed inset-0 z-[80] flex items-end bg-[#0a0a0a]/45" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
              <ScrollLock />
              <div ref={panel} className="erp-sheet flex max-h-[75dvh] w-full flex-col rounded-t-2xl bg-white pb-[max(8px,env(safe-area-inset-bottom))] shadow-2xl" onKeyDown={onKey}>
                <div className="flex items-center justify-between px-4 pb-1 pt-3">
                  <span className="text-sm font-semibold text-[#0a0a0a]">{heading || "Choose"}</span>
                  <button type="button" onClick={() => close()} className="grid h-9 w-9 place-items-center rounded-md text-[#737373] active:bg-[#f4f4f5]" aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {searchBox}
                {list}
              </div>
            </div>
          ) : (
            <div
              ref={panel}
              className="erp-pop fixed z-[80] flex flex-col overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-[0_12px_32px_rgb(0_0_0/0.12)]"
              style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.width, maxHeight: pos?.maxH, transform: pos?.up ? "translateY(-100%)" : undefined }}
              onKeyDown={onKey}
            >
              {searchBox}
              {list}
            </div>
          ),
          document.body,
        )}
    </>
  );
}
