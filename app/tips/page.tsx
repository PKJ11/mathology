import type { Metadata } from "next";
import Link from "next/link";
import styles from "./tips.module.css";

export const metadata: Metadata = { title: "Fast calculation tips & tricks — Mathology" };

// Public: no sign-in needed. Placeholder until the tips content is ready.
export default function TipsPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link href="/" className={styles.logo}>
          <img src="/logo-color.svg" alt="Mathology by Logicology" />
        </Link>
        <span className={styles.tag}>Coming soon</span>
        <h1>Fast calculation tips &amp; tricks</h1>
        <p>
          Quick mental-maths shortcuts for multiplying, squaring and dividing in your head are on their way. Check back
          soon!
        </p>
        <nav className={styles.actions}>
          <Link href="/chapters" className={styles.primary}>
            Explore Class 10 Labs
          </Link>
          <Link href="/" className={styles.secondary}>
            Back to home
          </Link>
        </nav>
      </section>
    </main>
  );
}
