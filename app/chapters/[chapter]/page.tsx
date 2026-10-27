import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AccountMenu } from "../../account-menu";
import styles from "../chapters.module.css";
import { chapters, chapterSlug, chapterSrc, getChapter } from "../chapters";

type Props = { params: Promise<{ chapter: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return chapters.map((c) => ({ chapter: chapterSlug(c) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const chapter = getChapter((await params).chapter);
  return {
    title: chapter ? `Chapter ${chapter.number} · ${chapter.title} — Mathology` : "Mathology",
  };
}

export default async function ChapterPage({ params }: Props) {
  const chapter = getChapter((await params).chapter);
  if (!chapter) notFound();
  await requireUser(`/chapters/${chapterSlug(chapter)}`);

  const prev = chapters.find((c) => c.number === chapter.number - 1);
  const next = chapters.find((c) => c.number === chapter.number + 1);

  return (
    <div className={styles.viewer}>
      <nav className={styles.bar}>
        <Link href="/">← All chapters</Link>
        <span className={styles.barTitle}>
          Chapter {chapter.number} · {chapter.title}
        </span>
        <span className={styles.barNav}>
          {prev ? (
            <Link href={`/chapters/${chapterSlug(prev)}`}>‹ Prev</Link>
          ) : (
            <span className={styles.disabled}>‹ Prev</span>
          )}
          {next ? (
            <Link href={`/chapters/${chapterSlug(next)}`}>Next ›</Link>
          ) : (
            <span className={styles.disabled}>Next ›</span>
          )}
        </span>
        <AccountMenu tone="bar" />
      </nav>

      <iframe
        key={chapter.number}
        className={styles.frame}
        src={chapterSrc(chapter)}
        title={`Chapter ${chapter.number}: ${chapter.title}`}
        allow="fullscreen"
      />
    </div>
  );
}
