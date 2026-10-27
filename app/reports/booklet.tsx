"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PageFlip } from "page-flip";
import styles from "./booklet.module.css";

/**
 * Turns server-rendered `[data-page]` elements into a page-turning booklet.
 *
 * page-flip moves and transforms the elements it is given, so it works on clones inside a
 * host element React never renders into; the originals stay hidden and are what gets printed.
 */
export function Booklet({ children, title }: { children: ReactNode; title: string }) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let flip: PageFlip | null = null;
    let host: HTMLDivElement | null = null;

    import("page-flip").then(({ PageFlip }) => {
      const source = sourceRef.current;
      const stage = stageRef.current;
      if (cancelled || !source || !stage) return;

      host = document.createElement("div");
      host.className = styles.book;
      source.querySelectorAll<HTMLElement>("[data-page]").forEach((p) => host!.appendChild(p.cloneNode(true)));
      stage.appendChild(host);

      flip = new PageFlip(host, {
        width: 460,
        height: 650,
        size: "stretch",
        minWidth: 280,
        maxWidth: 620,
        minHeight: 396,
        maxHeight: 876,
        showCover: true,
        usePortrait: true,
        autoSize: true,
        maxShadowOpacity: 0.45,
        flippingTime: 800,
        mobileScrollSupport: false,
        showPageCorners: true,
      });
      flip.loadFromHTML(host.querySelectorAll<HTMLElement>("[data-page]"));
      flip.on("flip", (e) => setPage(Number(e.data)));
      flip.on("changeOrientation", (e) => setPortrait(e.data === "portrait"));
      flipRef.current = flip;
      setCount(flip.getPageCount());
      setPortrait(flip.getOrientation() === "portrait");
      setReady(true);
    });

    return () => {
      cancelled = true;
      flipRef.current = null;
      try {
        flip?.destroy();
      } catch {
        // already torn down
      }
      // page-flip's requestAnimationFrame loop has no stop; turn its remaining frames into no-ops
      const render = flip?.getRender() as { render?: () => void } | undefined;
      if (render) render.render = () => {};
      host?.remove();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") flipRef.current?.flipNext();
      if (e.key === "ArrowLeft") flipRef.current?.flipPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // In a two-page spread the cover and back cover sit alone; inner pages come in pairs
  const showing =
    portrait || page === 0 || page >= count - 1 ? `${page + 1}` : `${page + 1}–${Math.min(page + 2, count)}`;

  return (
    <section className={styles.wrap} aria-label={title}>
      <div ref={stageRef} className={styles.stage} />
      {!ready && <p className={styles.loading}>Opening your booklet…</p>}

      <nav className={styles.controls} aria-label="Booklet pages">
        <button type="button" onClick={() => flipRef.current?.turnToPage(0)} disabled={!ready || page === 0}>
          Cover
        </button>
        <button type="button" onClick={() => flipRef.current?.flipPrev()} disabled={!ready || page === 0} aria-label="Previous page">
          ‹ Prev
        </button>
        <span className={styles.counter} aria-live="polite">
          {ready ? `Page ${showing} of ${count}` : " "}
        </span>
        <button
          type="button"
          onClick={() => flipRef.current?.flipNext()}
          disabled={!ready || page >= count - (portrait ? 1 : 2)}
          aria-label="Next page"
        >
          Next ›
        </button>
        <button type="button" onClick={() => window.print()} disabled={!ready}>
          Print / PDF
        </button>
      </nav>
      <p className={styles.tip}>Drag a page corner, use the arrow keys, or the buttons to turn pages.</p>

      <div ref={sourceRef} className={styles.source} hidden>
        {children}
      </div>
    </section>
  );
}
