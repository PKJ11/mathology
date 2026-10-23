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

/** Decorative artwork that rises into place one after another on load. */
export function Decor({ items, delay = 0 }: { items: DecorItem[]; delay?: number }) {
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
        !item.d && styles.hideDesktop,
        !item.m && styles.hideMobile,
      ]
        .filter(Boolean)
        .join(" ")}
      style={place(item, delay + i)}
    />
  ));
}
