"use client";

import { useLayoutEffect, useRef } from "react";

// Past this point the entrance is already playing; leave it in its fallback (pop in place) form.
const LATEST_MS = 1800;

/**
 * Aims every `[data-fly]` element inside the nearest `[data-fly-root]` at the `[data-anchor]`
 * element, by setting `--fx` / `--fy` to the offset the entrance animation starts from.
 * Measured on the page rather than on the artboard because text and buttons flow and wrap.
 */
export function FlyFromAnchor() {
  const marker = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = marker.current?.closest("[data-fly-root]");
    const anchor = root?.querySelector("[data-anchor]");
    if (!root || !anchor || Number(document.timeline.currentTime ?? 0) > LATEST_MS) return;

    // Images may not have loaded yet, so fall back to the width for a missing height
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + (r.height || r.width) / 2 };
    };
    const els = [...root.querySelectorAll<HTMLElement>("[data-fly]")];
    // Measure each element where it lands, not where an earlier run already sent it
    els.forEach((el) => {
      el.style.removeProperty("--fx");
      el.style.removeProperty("--fy");
    });
    const from = centre(anchor);
    const offsets = els.map((el) => {
      const to = centre(el);
      return { x: from.x - to.x, y: from.y - to.y };
    });
    els.forEach((el, i) => {
      el.style.setProperty("--fx", `${offsets[i].x}px`);
      el.style.setProperty("--fy", `${offsets[i].y}px`);
    });
  }, []);

  return <span ref={marker} hidden />;
}
