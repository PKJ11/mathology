import "server-only";
import type { ObjectId } from "mongodb";
import { chapters } from "@/app/chapters/chapters";
import catalogue from "./catalogue.json";
import { collections } from "./db";

const TZ = process.env.REPORT_TIMEZONE || "Asia/Kolkata";
const DAY_COUNT = 35;

type Catalogue = Record<string, { chapterId: string; groups: Record<string, string>; skills: Record<string, { title: string; group: number; scope: string }> }>;
const CAT = catalogue as Catalogue;

export type SkillStatus = "strong" | "building" | "revisit" | "early";

export type SkillReport = {
  id: string;
  title: string;
  groupTitle: string | null;
  attempts: number;
  correct: number;
  independentAttempts: number;
  independentCorrect: number;
  status: SkillStatus;
};

export type ChapterReport = {
  number: number;
  title: string;
  attempts: number;
  correct: number;
  independentAttempts: number;
  independentCorrect: number;
  activeMinutes: number;
  avgSeconds: number | null;
  runsStarted: number;
  runsCompleted: number;
  lessonsCompleted: number;
  supportUses: number;
  skillsPracticed: number;
  skillsTotal: number;
  lastActivity: string | null;
  skills: SkillReport[];
};

export type ReportData = {
  student: { name: string; email: string | null; school: string | null; className: string | null; grade: string };
  generatedAt: string;
  timezone: string;
  period: { from: string | null; to: string | null };
  totals: {
    activeMinutes: number;
    sessions: number;
    events: number;
    attempts: number;
    correct: number;
    independentAttempts: number;
    independentCorrect: number;
    chaptersStarted: number;
    runsStarted: number;
    runsCompleted: number;
    lessonsCompleted: number;
    supportUses: number;
    rejectedSubmissions: number;
    drafts: number;
    avgSeconds: number | null;
  };
  modes: { mode: string; attempts: number; correct: number }[];
  daily: { date: string; attempts: number; activeMinutes: number }[];
  chapters: ChapterReport[];
  mistakes: { chapter: number; skill: string; prompt: string | null; response: string | null; answer: string | null; at: string }[];
  drafts: { chapter: number; title: string; text: string; savedAt: string; versions: number }[];
  adaptive: {
    decisions: number;
    interventions: number;
    remediations: number;
    recent: { at: string; chapter: number; skill: string; action: string | null; reason: string | null }[];
  };
};

const SUPPORT_TYPES = ["HELP_USED", "HINT_OPENED", "EXPLANATION_OPENED", "TRANSFER_REASONING_OPENED"];
const COUNTED_TYPES = [
  ...SUPPORT_TYPES,
  "SUBMIT_REJECTED",
  "ADAPTIVE_DECISION",
  "ADAPTIVE_INTERVENTION",
  "REMEDIATION_STARTED",
];

export const skillTitle = (chapter: number, id: string) => CAT[chapter]?.skills[id]?.title ?? id;
const groupTitle = (chapter: number, group: number | string | null | undefined) =>
  group == null ? null : (CAT[chapter]?.groups[String(group)] ?? null);

/** Descriptive only: a skill with little evidence is "too early to tell", never "weak". */
function status(s: Pick<SkillReport, "attempts" | "correct" | "independentAttempts" | "independentCorrect">): SkillStatus {
  if (s.attempts < 3) return "early";
  if (s.independentAttempts >= 3 && s.independentCorrect / s.independentAttempts >= 0.8) return "strong";
  if (s.correct / s.attempts < 0.5) return "revisit";
  return "building";
}

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

export async function buildReport(userId: ObjectId): Promise<ReportData | null> {
  const { users, attempts, runs, learningSessions, events, drafts } = await collections();
  const user = await users.findOne({ _id: userId }, { projection: { passwordHash: 0 } });
  if (!user) return null;

  const since = new Date(Date.now() - DAY_COUNT * 86_400_000);

  const [bySkill, byMode, dailyAttempts, sessions, runCounts, eventCounts, learnGroups, mistakes, latestDrafts, recentDecisions, eventTotal] =
    await Promise.all([
      attempts
        .aggregate<{
          _id: { chapter: number; skillId: string };
          attempts: number;
          correct: number;
          indA: number;
          indC: number;
          secSum: number;
          secN: number;
          last: Date;
        }>([
          { $match: { userId } },
          {
            $group: {
              _id: { chapter: "$chapter", skillId: "$skillId" },
              attempts: { $sum: 1 },
              correct: { $sum: { $cond: ["$correct", 1, 0] } },
              indA: { $sum: { $cond: ["$independent", 1, 0] } },
              indC: { $sum: { $cond: [{ $and: ["$independent", "$correct"] }, 1, 0] } },
              secSum: { $sum: { $cond: [{ $and: ["$timingValid", { $gt: ["$activeSeconds", 0] }] }, "$activeSeconds", 0] } },
              secN: { $sum: { $cond: [{ $and: ["$timingValid", { $gt: ["$activeSeconds", 0] }] }, 1, 0] } },
              last: { $max: "$submittedAt" },
            },
          },
        ])
        .toArray(),
      attempts
        .aggregate<{ _id: string; attempts: number; correct: number }>([
          { $match: { userId } },
          { $group: { _id: "$mode", attempts: { $sum: 1 }, correct: { $sum: { $cond: ["$correct", 1, 0] } } } },
          { $sort: { attempts: -1 } },
        ])
        .toArray(),
      attempts
        .aggregate<{ _id: string; n: number }>([
          { $match: { userId, submittedAt: { $gte: since } } },
          { $group: { _id: { $dateToString: { date: "$submittedAt", format: "%Y-%m-%d", timezone: TZ } }, n: { $sum: 1 } } },
        ])
        .toArray(),
      learningSessions
        .find({ userId }, { projection: { chapter: 1, startedAt: 1, lastSeenAt: 1, activeMs: 1 } })
        .toArray(),
      runs
        .aggregate<{ _id: number; started: number; completed: number }>([
          { $match: { userId } },
          { $group: { _id: "$chapter", started: { $sum: 1 }, completed: { $sum: { $cond: ["$complete", 1, 0] } } } },
        ])
        .toArray(),
      events
        .aggregate<{ _id: { chapter: number; type: string }; n: number }>([
          { $match: { userId, type: { $in: COUNTED_TYPES } } },
          { $group: { _id: { chapter: "$chapter", type: "$type" }, n: { $sum: 1 } } },
        ])
        .toArray(),
      events
        .aggregate<{ _id: number; groups: unknown[] }>([
          { $match: { userId, type: "LEARN_COMPLETED" } },
          { $group: { _id: "$chapter", groups: { $addToSet: "$payload.group" } } },
        ])
        .toArray(),
      attempts
        .find({ userId, correct: false }, { projection: { chapter: 1, skillId: 1, prompt: 1, responseText: 1, answer: 1, submittedAt: 1 } })
        .sort({ submittedAt: -1 })
        .limit(12)
        .toArray(),
      drafts
        .aggregate<{ _id: { chapter: number; group: string }; text: string; savedAt: Date; versions: number }>([
          { $match: { userId } },
          { $sort: { savedAt: -1 } },
          {
            $group: {
              _id: { chapter: "$chapter", group: "$group" },
              text: { $first: "$text" },
              savedAt: { $first: "$savedAt" },
              versions: { $sum: 1 },
            },
          },
          { $sort: { savedAt: -1 } },
          { $limit: 12 },
        ])
        .toArray(),
      events
        .find({ userId, type: "ADAPTIVE_DECISION" }, { projection: { chapter: 1, clientAt: 1, payload: 1 } })
        .sort({ clientAt: -1 })
        .limit(6)
        .toArray(),
      events.countDocuments({ userId }),
    ]);

  // Sessions → active time, overall and per chapter / day
  const activeByChapter = new Map<number, number>();
  const activeByDay = new Map<string, number>();
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  let first: Date | null = null;
  let last: Date | null = null;
  let totalActiveMs = 0;
  for (const s of sessions) {
    const ms = s.activeMs ?? 0;
    totalActiveMs += ms;
    activeByChapter.set(s.chapter, (activeByChapter.get(s.chapter) ?? 0) + ms);
    if (s.startedAt >= since) {
      const k = dayKey.format(s.startedAt);
      activeByDay.set(k, (activeByDay.get(k) ?? 0) + ms);
    }
    if (!first || s.startedAt < first) first = s.startedAt;
    if (!last || s.lastSeenAt > last) last = s.lastSeenAt;
  }

  const countOf = (chapter: number | null, types: string[]) =>
    eventCounts
      .filter((e) => types.includes(e._id.type) && (chapter === null || e._id.chapter === chapter))
      .reduce((n, e) => n + e.n, 0);

  const chapterReports: ChapterReport[] = chapters.map((c) => {
    const rows = bySkill.filter((r) => r._id.chapter === c.number);
    const skills: SkillReport[] = rows
      .map((r) => {
        const base = { attempts: r.attempts, correct: r.correct, independentAttempts: r.indA, independentCorrect: r.indC };
        const meta = CAT[c.number]?.skills[r._id.skillId];
        return {
          id: r._id.skillId,
          title: meta?.title ?? r._id.skillId,
          groupTitle: groupTitle(c.number, meta?.group),
          ...base,
          status: status(base),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    const sum = (k: "attempts" | "correct" | "indA" | "indC" | "secSum" | "secN") => rows.reduce((n, r) => n + r[k], 0);
    const secN = sum("secN");
    const runRow = runCounts.find((r) => r._id === c.number);
    const lastAt = rows.reduce<Date | null>((m, r) => (!m || r.last > m ? r.last : m), null);
    return {
      number: c.number,
      title: c.title,
      attempts: sum("attempts"),
      correct: sum("correct"),
      independentAttempts: sum("indA"),
      independentCorrect: sum("indC"),
      activeMinutes: round((activeByChapter.get(c.number) ?? 0) / 60_000),
      avgSeconds: secN ? round(sum("secSum") / secN) : null,
      runsStarted: runRow?.started ?? 0,
      runsCompleted: runRow?.completed ?? 0,
      lessonsCompleted: learnGroups.find((g) => g._id === c.number)?.groups.length ?? 0,
      supportUses: countOf(c.number, SUPPORT_TYPES),
      skillsPracticed: skills.length,
      skillsTotal: Object.keys(CAT[c.number]?.skills ?? {}).length,
      lastActivity: lastAt?.toISOString() ?? null,
      skills,
    };
  });

  const total = <K extends keyof ChapterReport>(k: K) =>
    chapterReports.reduce((n, c) => n + (c[k] as number), 0);
  const allSecN = bySkill.reduce((n, r) => n + r.secN, 0);

  const days: ReportData["daily"] = [];
  const counts = new Map(dailyAttempts.map((d) => [d._id, d.n]));
  for (let i = DAY_COUNT - 1; i >= 0; i--) {
    const k = dayKey.format(new Date(Date.now() - i * 86_400_000));
    days.push({ date: k, attempts: counts.get(k) ?? 0, activeMinutes: round((activeByDay.get(k) ?? 0) / 60_000) });
  }

  return {
    student: { name: user.name, email: user.email ?? null, school: user.school, className: user.className, grade: user.grade },
    generatedAt: new Date().toISOString(),
    timezone: TZ,
    period: { from: first?.toISOString() ?? null, to: last?.toISOString() ?? null },
    totals: {
      activeMinutes: round(totalActiveMs / 60_000),
      sessions: sessions.length,
      events: eventTotal,
      attempts: total("attempts"),
      correct: total("correct"),
      independentAttempts: total("independentAttempts"),
      independentCorrect: total("independentCorrect"),
      chaptersStarted: chapterReports.filter((c) => c.attempts || c.activeMinutes || c.runsStarted).length,
      runsStarted: total("runsStarted"),
      runsCompleted: total("runsCompleted"),
      lessonsCompleted: total("lessonsCompleted"),
      supportUses: countOf(null, SUPPORT_TYPES),
      rejectedSubmissions: countOf(null, ["SUBMIT_REJECTED"]),
      drafts: latestDrafts.length,
      avgSeconds: allSecN ? round(bySkill.reduce((n, r) => n + r.secSum, 0) / allSecN) : null,
    },
    modes: byMode.map((m) => ({ mode: m._id ?? "unknown", attempts: m.attempts, correct: m.correct })),
    daily: days,
    chapters: chapterReports,
    mistakes: mistakes.map((m) => ({
      chapter: m.chapter,
      skill: skillTitle(m.chapter, m.skillId),
      prompt: m.prompt,
      response: m.responseText,
      answer: m.answer,
      at: m.submittedAt.toISOString(),
    })),
    drafts: latestDrafts.map((d) => {
      const [kind, group] = d._id.group.includes(":") ? d._id.group.split(":") : ["", d._id.group];
      const title = groupTitle(d._id.chapter, group) ?? `Lesson ${group}`;
      return {
        chapter: d._id.chapter,
        title: kind ? `${title} · ${kind === "proof" ? "proof" : "transfer"}` : title,
        text: d.text,
        savedAt: d.savedAt.toISOString(),
        versions: d.versions,
      };
    }),
    adaptive: {
      decisions: countOf(null, ["ADAPTIVE_DECISION"]),
      interventions: countOf(null, ["ADAPTIVE_INTERVENTION"]),
      remediations: countOf(null, ["REMEDIATION_STARTED"]),
      recent: recentDecisions.map((d) => ({
        at: d.clientAt.toISOString(),
        chapter: d.chapter,
        skill: typeof d.payload.skillId === "string" ? skillTitle(d.chapter, d.payload.skillId) : "—",
        action: typeof d.payload.action === "string" ? d.payload.action : null,
        reason: typeof d.payload.reason === "string" ? d.payload.reason : null,
      })),
    },
  };
}

/** Students a teacher can open, most recently active first. */
export async function listStudents() {
  const { users, learningSessions } = await collections();
  const list = await users
    .find(
      { role: "student" },
      { projection: { name: 1, email: 1, phone: 1, school: 1, className: 1, grade: 1, city: 1, createdAt: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();
  const seen = await learningSessions
    .aggregate<{ _id: ObjectId; last: Date }>([{ $group: { _id: "$userId", last: { $max: "$lastSeenAt" } } }])
    .toArray();
  const lastSeen = new Map(seen.map((s) => [s._id.toHexString(), s.last]));
  return list
    .map((u) => ({
      id: u._id.toHexString(),
      name: u.name,
      contact: u.phone ?? u.email ?? null,
      school: u.school,
      city: u.city ?? null,
      // Phone sign-ups give a grade; older email accounts gave a class / section
      className: u.className ?? (u.grade ? `Grade ${u.grade}` : null),
      lastActive: lastSeen.get(u._id.toHexString())?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));
}
