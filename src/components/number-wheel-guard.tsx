"use client";

import { useEffect } from "react";

/** Scrolling the page over a focused number box must not change its value; phones get the number keypad. */
export function NumberWheelGuard() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number" && e.target === el) el.blur();
    }
    document.addEventListener("wheel", onWheel, { passive: true });

    // Phones: open the number keypad for number boxes (with a decimal point unless the box takes whole numbers only).
    const tag = (root: ParentNode) => {
      root.querySelectorAll?.('input[type="number"]:not([inputmode])').forEach((n) => {
        const step = n.getAttribute("step");
        const whole = step != null && step !== "any" && Number.isInteger(Number(step));
        n.setAttribute("inputmode", whole ? "numeric" : "decimal");
      });
    };
    tag(document);
    const obs = new MutationObserver((list) => {
      for (const m of list) m.addedNodes.forEach((n) => n instanceof Element && (n.matches('input[type="number"]') ? tag(n.parentElement ?? document) : tag(n)));
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("wheel", onWheel);
      obs.disconnect();
    };
  }, []);
  return null;
}
