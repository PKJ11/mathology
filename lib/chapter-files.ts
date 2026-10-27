import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** localStorage keys each chapter writes. Chapter 1 keeps one event-log key; 2–14 keep four stores. */
export function chapterStoreKeys(chapter: number): string[] {
  if (chapter === 1) return ["mathology-real-numbers-v1"];
  const id = `M10.${String(chapter).padStart(2, "0")}`;
  return ["progress", "evidence", "drafts", "exposure"].map((k) => `mathology:${id}:v1:${k}`);
}

const htmlCache = new Map<number, Promise<string>>();

export function chapterHtml(chapter: number): Promise<string> {
  let html = htmlCache.get(chapter);
  if (!html || process.env.NODE_ENV !== "production") {
    html = readFile(path.join(process.cwd(), "content", `Mathology Chapter ${chapter}.html`), "utf8");
    htmlCache.set(chapter, html);
  }
  return html;
}
