import type { Metadata } from "next";
import Link from "next/link";
import { Backdrop, Decor, type DecorItem } from "../decor";
import { AccountMenu } from "../account-menu";
import styles from "./chapters.module.css";
import { chapters, chapterSlug } from "./chapters";

export const metadata: Metadata = {
  title: "Chapters — Mathology",
};

// Artboards: 2302 wide on desktop, 504 wide on phones (white panel at x 102–402)
const sides: DecorItem[] = [
  // Light grey operators on the white panel
  { src: "addition.png", ghost: true, d: { x: 550, y: 104, w: 127 }, m: null },
  { src: "subtraction.png", ghost: true, d: { x: 1666, y: 131, w: 127 }, m: null },
  { src: "division.png", ghost: true, d: { x: 400, y: 720, w: 127 }, m: null },
  { src: "multiplication.png", ghost: true, d: { x: 1793, y: 738, w: 112 }, m: null },

  // Left side
  { src: "2x-3y.png", d: { x: 133, y: 120, w: 118 }, m: { x: 8, y: 80, w: 82, r: 30 } },
  { src: "8.png", float: true, d: { x: 77, y: 335, w: 62 }, m: { x: 34, y: 250, w: 36 } },
  { src: "graph.png", d: { x: 110, y: 595, w: 165 }, m: { x: 10, y: 420, w: 80 } },
  { src: "radius.png", d: null, m: { x: 16, y: 640, w: 68 } },
  { src: "7.png", float: true, d: null, m: { x: 30, y: 850, w: 50 } },
  { src: "minus-13x5.png", d: null, m: { x: 6, y: 1060, w: 88 } },
  { src: "9.png", float: true, d: null, m: { x: 38, y: 1280, w: 28 } },
  { src: "sqrt-ab2.png", d: null, m: { x: 6, y: 1470, w: 90 } },

  // Right side
  { src: "12x6.png", d: { x: 2075, y: 145, w: 123 }, m: { x: 418, y: 80, w: 74 } },
  { src: "sqrt-ab2.png", d: { x: 2053, y: 450, w: 188 }, m: null },
  { src: "q.png", float: true, d: null, m: { x: 436, y: 250, w: 40 } },
  { src: "9.png", float: true, d: { x: 2058, y: 645, w: 55 }, m: null },
  { src: "graph-2.png", d: { x: 2105, y: 835, w: 185 }, m: { x: 414, y: 430, w: 82 } },
  { src: "3.png", float: true, d: null, m: { x: 440, y: 660, w: 34 } },
  { src: "pi.png", d: null, m: { x: 414, y: 850, w: 80 } },
  { src: "divider.png", d: null, m: { x: 440, y: 1040, w: 38 } },
  { src: "scale.png", d: null, m: { x: 428, y: 1250, w: 60 } },
  { src: "books.png", d: null, m: { x: 410, y: 1490, w: 86 } },
];

// Below the white panel, positioned from its bottom edge
const footer: DecorItem[] = [
  { src: "7.png", d: { x: 250, y: 30, w: 100 }, m: { x: 30, y: 24, w: 56 } },
  { src: "minus-13x5.png", d: { x: 727, y: 85, w: 225 }, m: null },
  { src: "3.png", d: { x: 1287, y: 80, w: 55 }, m: { x: 430, y: 30, w: 44 } },
  { src: "ab2.png", d: { x: 1722, y: 80, w: 188 }, m: { x: 177, y: 34, w: 150 } },
];

export default function ChaptersPage() {
  return (
    <main className={styles.page}>
      <Backdrop />
      <div className={styles.stage}>
        <section className={styles.panel}>
          <div className={styles.account}>
            <AccountMenu />
          </div>
          <Link href="/" className={styles.logo}>
            <img src="/logo-color.svg" alt="Mathology by Logicology" />
          </Link>
          <h1>Chapters</h1>

          <ul className={styles.grid}>
            {chapters.map((c) => (
              <li key={c.number}>
                <Link href={`/chapters/${chapterSlug(c)}`} className={styles.card}>
                  <span className={styles.cardNumber}>Chapter - {c.number}</span>
                  <span className={styles.cardTitle}>{c.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Decor items={sides} />

        <div className={styles.footer}>
          <Decor items={footer} delay={sides.length} />
        </div>
      </div>
    </main>
  );
}
