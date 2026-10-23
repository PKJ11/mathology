import Link from "next/link";
import { Backdrop, Decor, type DecorItem } from "./decor";
import styles from "./home.module.css";

// Artboards: 2302 × 1080 on desktop, 800 × 1700 on phones
const decor: DecorItem[] = [
  // Light grey operators sitting on the white shape
  { src: "addition.png", ghost: true, d: { x: 397, y: 69, w: 127 }, m: { x: 48, y: 64, w: 80 } },
  { src: "subtraction.png", ghost: true, d: { x: 1842, y: 87, w: 127 }, m: { x: 664, y: 110, w: 90 } },
  { src: "division.png", ghost: true, d: { x: 550, y: 400, w: 127 }, m: { x: 52, y: 690, w: 70 } },
  { src: "multiplication.png", ghost: true, d: { x: 1617, y: 428, w: 110 }, m: { x: 680, y: 700, w: 64 } },

  // Left side
  { src: "2x-3y.png", d: { x: 52, y: 172, w: 118 }, m: { x: 60, y: 1600, w: 170 } },
  { src: "8.png", float: true, d: { x: 85, y: 357, w: 62 }, m: { x: 40, y: 965, w: 46 } },
  { src: "radius.png", d: { x: 282, y: 424, w: 120 }, m: null },
  { src: "graph.png", d: { x: 45, y: 535, w: 165 }, m: null },
  { src: "7.png", float: true, d: { x: 130, y: 868, w: 100 }, m: { x: 360, y: 1420, w: 70 } },
  { src: "divider.png", d: { x: 370, y: 632, w: 122 }, m: { x: 40, y: 1060, w: 100 } },
  { src: "scale.png", d: { x: 548, y: 553, w: 249 }, m: { x: 150, y: 1010, w: 190 } },
  { src: "minus-13x5.png", d: { x: 793, y: 770, w: 225 }, m: { x: 50, y: 1430, w: 220 } },

  // Right side
  { src: "12x6.png", d: { x: 2135, y: 155, w: 123 }, m: { x: 600, y: 1580, w: 130 } },
  { src: "q.png", float: true, d: { x: 1840, y: 232, w: 132 }, m: { x: 716, y: 940, w: 52 } },
  { src: "sqrt-ab2.png", d: { x: 2050, y: 382, w: 188 }, m: null },
  { src: "9.png", float: true, d: { x: 2025, y: 572, w: 30 }, m: null },
  { src: "graph-2.png", d: { x: 2093, y: 530, w: 185 }, m: null },
  { src: "3.png", float: true, d: { x: 1378, y: 866, w: 57 }, m: null },
  { src: "pi.png", d: { x: 1555, y: 600, w: 382 }, m: { x: 490, y: 1040, w: 250 } },
  { src: "books.png", d: { x: 1868, y: 803, w: 322 }, m: { x: 560, y: 1220, w: 220 } },
  { src: "ab2.png", d: { x: 1790, y: 1003, w: 120 }, m: { x: 520, y: 1450, w: 200 } },
  { src: "cube-white.svg", d: { x: 1088, y: 932, w: 125 }, m: { x: 340, y: 1070, w: 120 } },
];

export default function HomePage() {
  return (
    <main className={styles.hero}>
      <Backdrop />
      <div className={styles.stage}>
        <svg className={`${styles.shape} ${styles.desktopOnly}`} viewBox="0 0 2302 1080" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="575" cy="944" rx="285" ry="24" className={styles.shadow} />
          <ellipse cx="1880" cy="944" rx="365" ry="24" className={styles.shadow} />
          <path
            className={styles.blob}
            d="M160,0 C175,140 260,215 360,240 C450,262 475,320 468,400 C460,480 455,560 520,600 C590,645 680,660 820,668 C960,676 1040,720 1060,800 C1072,850 1076,880 1080,907 L1140,907 L1155,924 L1170,907 L1222,907 C1230,820 1250,750 1330,720 C1420,686 1560,706 1680,690 C1800,672 1838,620 1840,540 C1842,450 1820,360 1880,300 C1940,240 2030,250 2090,170 C2125,120 2140,60 2145,0 Z"
          />
        </svg>
        <svg className={`${styles.shape} ${styles.mobileOnly}`} viewBox="0 0 800 1700" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="190" cy="1330" rx="170" ry="18" className={styles.shadow} />
          <ellipse cx="625" cy="1322" rx="170" ry="18" className={styles.shadow} />
          <path
            className={styles.blob}
            d="M0,0 H800 V820 C800,900 740,930 660,925 C560,918 500,940 472,990 C462,1010 458,1030 456,1046 L412,1046 L400,1060 L388,1046 L344,1046 C342,1030 338,1010 328,990 C300,940 240,918 140,925 C60,930 0,900 0,820 Z"
          />
        </svg>

        <Decor items={decor} />

        <Link href="/" className={styles.logo}>
          <img src="/logo-color.svg" alt="Mathology by Logicology" />
        </Link>

        <div className={styles.content}>
          <h1>Mathology by logicology</h1>
          <p>At Logicology we endeavour to make learning fun so that children learn while they play.</p>
          <nav className={styles.actions}>
            <Link href="#" className={styles.button}>
              Fast calculation
              <br />
              tips &amp; tricks
            </Link>
            <Link href="/chapters" className={styles.button}>
              Class 10 Labs
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
