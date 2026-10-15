import type { Metadata } from "next";
import Link from "next/link";
import styles from "./chapters.module.css";
import { chapters, chapterSlug } from "./chapters";

export const metadata: Metadata = {
  title: "Chapters — Mathology",
};

export default function ChaptersPage() {
  return (
    <main className={styles.list}>
      <div className={styles.heading}>
        <img src="/logo-color.svg" alt="Mathology" width={63} height={56} />
        <h1>Chapters</h1>
      </div>

      <ul className={styles.grid}>
        {chapters.map((c) => (
          <li key={c.number}>
            <Link href={`/chapters/${chapterSlug(c)}`} className={styles.card}>
              <span className={styles.cardNumber}>Chapter {c.number}</span>
              <span className={styles.cardTitle}>{c.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
