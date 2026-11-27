"use client";

import { useEffect } from "react";

// Several popups can be open at once (a confirm on top of an edit box): the page is freed when the last one closes.
let locks = 0;
let saved: { y: number; html: string; body: Partial<CSSStyleDeclaration> } | null = null;

function lock() {
  if (locks++ > 0) return;
  const html = document.documentElement;
  const b = document.body.style;
  const y = window.scrollY;
  saved = { y, html: html.style.overflow, body: { overflow: b.overflow, position: b.position, top: b.top, left: b.left, right: b.right, width: b.width } };
  // "overflow: hidden" alone is ignored by iPhone Safari, so the page is pinned where it is.
  html.style.overflow = "hidden";
  b.overflow = "hidden";
  b.position = "fixed";
  b.top = `-${y}px`;
  b.left = "0";
  b.right = "0";
  b.width = "100%";
}

function unlock() {
  if (--locks > 0 || !saved) return;
  const b = document.body.style;
  document.documentElement.style.overflow = saved.html;
  b.overflow = saved.body.overflow ?? "";
  b.position = saved.body.position ?? "";
  b.top = saved.body.top ?? "";
  b.left = saved.body.left ?? "";
  b.right = saved.body.right ?? "";
  b.width = saved.body.width ?? "";
  window.scrollTo(0, saved.y);
  saved = null;
}

/** Stops the page behind a popup or menu from scrolling while `active` is true. */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}

/** Drop inside any popup: the page behind it cannot scroll while the popup is shown. */
export function ScrollLock() {
  useScrollLock(true);
  return null;
}
