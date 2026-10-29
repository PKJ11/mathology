import type { CSSProperties } from "react";
import styles from "./decor.module.css";

/*
 * Artwork placed on a design artboard. Boxes are in artboard units (`--u`,
 * set by the page) for desktop (`d`) and phones (`m`); `null` hides the item
 * on that layout. `r` rotates the artwork by that many degrees.
 */
export type Box = { x: number; y: number; w: number; r?: number };
export type DecorItem = {
  src: string;
  d: Box | null;
  m: Box | null;
  ghost?: boolean;
  float?: boolean;
  /** Lands first; every other item then bursts out of it to its place, nearest first */
  anchor?: boolean;
};

const place = ({ d, m }: DecorItem, i: number) =>
  ({
    "--i": i,
    "--dx": d?.x ?? 0,
    "--dy": d?.y ?? 0,
    "--dw": d?.w ?? 0,
    "--dr": d?.r ?? 0,
    "--mx": m?.x ?? 0,
    "--my": m?.y ?? 0,
    "--mw": m?.w ?? 0,
    "--mr": m?.r ?? 0,
  }) as CSSProperties;

/** Green grid background that rises from the bottom of the screen on load. */
export function Backdrop() {
  return <div className={styles.backdrop} aria-hidden="true" />;
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.w / 2 });

/** Offset from an item to the anchor, and the item's launch order by distance, for one layout. */
function burst(items: DecorItem[], anchor: DecorItem, layout: "d" | "m") {
  const from = anchor[layout] && centre(anchor[layout]!);
  const offsets = items.map((item) => {
    const box = item[layout];
    if (!from || !box || item === anchor) return { x: 0, y: 0, dist: 0 };
    const c = centre(box);
    return { x: from.x - c.x, y: from.y - c.y, dist: Math.hypot(from.x - c.x, from.y - c.y) };
  });
  const rank = new Map([...offsets.keys()].sort((a, b) => offsets[a].dist - offsets[b].dist).map((i, n) => [i, n]));
  return offsets.map((o, i) => ({ ...o, order: rank.get(i)! }));
}

/**
 * Decorative artwork that rises into place one after another on load, or, when an item is
 * marked `anchor`, lands that item first and bursts the rest out of it.
 */
export function Decor({ items, delay = 0 }: { items: DecorItem[]; delay?: number }) {
  const anchor = items.find((item) => item.anchor);
  const desktop = anchor && burst(items, anchor, "d");
  const mobile = anchor && burst(items, anchor, "m");

  return items.map((item, i) => (
    <img
      key={i}
      src={`/home/${item.src}`}
      alt=""
      aria-hidden="true"
      className={[
        styles.item,
        item.ghost && styles.ghost,
        item.float && styles.float,
        anchor && (item === anchor ? styles.anchor : styles.burst),
        !item.d && styles.hideDesktop,
        !item.m && styles.hideMobile,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...place(item, delay + i),
        ...(desktop &&
          mobile && {
            "--dfx": desktop[i].x,
            "--dfy": desktop[i].y,
            "--dn": desktop[i].order,
            "--mfx": mobile[i].x,
            "--mfy": mobile[i].y,
            "--mn": mobile[i].order,
          }),
      }}
    />
  ));
}
