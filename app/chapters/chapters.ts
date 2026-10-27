export type Chapter = {
  number: number;
  title: string;
};

export const chapters: Chapter[] = [
  { number: 1, title: "Real Numbers" },
  { number: 2, title: "Polynomials" },
  { number: 3, title: "Pair of Linear Equations" },
  { number: 4, title: "Quadratic Equations" },
  { number: 5, title: "Arithmetic Progressions" },
  { number: 6, title: "Triangles" },
  { number: 7, title: "Coordinate Geometry" },
  { number: 8, title: "Introduction to Trigonometry" },
  { number: 9, title: "Some Applications of Trigonometry" },
  { number: 10, title: "Circles" },
  { number: 11, title: "Areas Related to Circles" },
  { number: 12, title: "Surface Areas and Volumes" },
  { number: 13, title: "Statistics" },
  { number: 14, title: "Probability" },
];

export function getChapter(slug: string): Chapter | undefined {
  const match = /^chapter-(\d+)$/.exec(slug);
  if (!match) return undefined;
  return chapters.find((c) => c.number === Number(match[1]));
}

export const chapterSlug = (c: Chapter) => `chapter-${c.number}`;
// Served by app/lab/[chapter]/route.ts with the interaction tracker injected
export const chapterSrc = (c: Chapter) => `/lab/${chapterSlug(c)}`;
