// Extracts the static curriculum catalogue (lesson groups and micro-skills) from the
// chapter HTML files so reports can join skill IDs to readable titles.
// Run with: npm run catalogue
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const catalogue = {};

for (let n = 1; n <= 14; n++) {
  const html = await readFile(path.join(root, "content", `Mathology Chapter ${n}.html`), "utf8");
  const chapterId = `M10.${String(n).padStart(2, "0")}`;
  const skills = {};
  const groups = {};

  // Chapters 2–14 embed skills as JSON objects
  for (const m of html.matchAll(/\{"id": *"(M10\.\d\d\.S\d\d\.M\d\d)", *"group": *(-?\d+), *"title": *"((?:[^"\\]|\\.)*)", *"scope": *"([^"]*)"/g)) {
    skills[m[1]] = { title: JSON.parse(`"${m[3]}"`), group: Number(m[2]), scope: m[4] };
  }
  // Chapter 1 embeds workbook rows: [id, chapter, strand, parent, title, scope, groupCode, ...]
  for (const m of html.matchAll(/\["(M10\.\d\d\.S\d\d\.M\d\d)","[^"]*","[^"]*","[^"]*","((?:[^"\\]|\\.)*)","([^"]*)","M10\.\d\d\.S(\d\d)"/g)) {
    skills[m[1]] ??= { title: JSON.parse(`"${m[2]}"`), group: Number(m[4]), scope: m[3] };
  }
  for (const m of html.matchAll(/\{id:(-?\d+), *title:'((?:[^'\\]|\\.)*)'/g)) {
    groups[m[1]] ??= m[2].replace(/\\'/g, "'");
  }
  // Later chapters embed groups as JSON, named by their activity
  for (const m of html.matchAll(/\{"id": *(-?\d+), *"activity": *"((?:[^"\\]|\\.)*)"/g)) {
    groups[m[1]] ??= JSON.parse(`"${m[2]}"`);
  }

  catalogue[n] = { chapterId, groups, skills };
  console.log(`Chapter ${n}: ${Object.keys(groups).length} groups, ${Object.keys(skills).length} skills`);
}

await writeFile(path.join(root, "lib", "catalogue.json"), JSON.stringify(catalogue, null, 1) + "\n");
