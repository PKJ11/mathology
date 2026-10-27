import "server-only";
import { MongoBulkWriteError, type AnyBulkWriteOperation, type ObjectId } from "mongodb";
import { collections, type AttemptDoc, type DraftDoc, type EventDoc, type LearningSessionDoc, type RunDoc } from "../db";

const MAX_EVENTS = 200;
const MAX_PAYLOAD_BYTES = 64_000;
const TYPE = /^[A-Z][A-Z0-9_]{1,63}$/;

type Json = Record<string, unknown>;

const str = (v: unknown, max = 200) => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown) => v === true;
const date = (v: unknown) => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export class IngestError extends Error {}

/** Validate a client batch, append it to the action log and update the read-optimised projections. */
export async function ingestEvents(userId: ObjectId, body: unknown, userAgent: string | null) {
  if (!isObj(body) || !Array.isArray(body.events)) throw new IngestError("Expected { events: [] }");
  if (body.events.length > MAX_EVENTS) throw new IngestError(`At most ${MAX_EVENTS} events per batch`);

  const receivedAt = new Date();
  const docs: EventDoc[] = [];
  let rejected = 0;

  for (const raw of body.events) {
    const doc = toEventDoc(userId, raw, receivedAt);
    if (doc) docs.push(doc);
    else rejected++;
  }

  const { events } = await collections();
  const failed = new Set<number>();
  if (docs.length) {
    try {
      await events.insertMany(docs, { ordered: false });
    } catch (err) {
      if (!(err instanceof MongoBulkWriteError)) throw err;
      const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
      for (const we of writeErrors) {
        if (we.code !== 11000) throw err; // only duplicates (retried batches) are expected
        failed.add(we.index);
      }
    }
  }

  // Projections run only for events stored for the first time, so counters stay exact on retries
  const fresh = docs.filter((_, i) => !failed.has(i));
  await project(userId, fresh, userAgent, isObj(body) ? body : {});

  return { accepted: fresh.length, duplicates: failed.size, rejected };
}

function toEventDoc(userId: ObjectId, raw: unknown, receivedAt: Date): EventDoc | null {
  if (!isObj(raw)) return null;
  const eventId = str(raw.eventId, 160);
  const type = typeof raw.type === "string" && TYPE.test(raw.type) ? raw.type : null;
  const sessionId = str(raw.sessionId, 80);
  const chapter = num(raw.chapter);
  if (!eventId || !type || !sessionId || !chapter || chapter < 1 || chapter > 14 || !Number.isInteger(chapter)) return null;

  let payload = isObj(raw.payload) ? raw.payload : {};
  const bytes = JSON.stringify(payload).length;
  if (bytes > MAX_PAYLOAD_BYTES) payload = { truncated: true, bytes };

  return {
    userId,
    eventId,
    type,
    sessionId,
    tabId: str(raw.tabId, 80),
    seq: num(raw.seq),
    chapter,
    chapterId: str(raw.chapterId, 20),
    route: str(raw.route, 200),
    clientAt: date(raw.clientAt) ?? receivedAt,
    receivedAt,
    contentVersion: str(raw.contentVersion, 40),
    releaseVersion: str(raw.releaseVersion, 40),
    source: raw.source === "chapter-log" ? "chapter-log" : "tracker",
    payload,
  };
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

const RUN_DEFAULTS: Omit<RunDoc, "userId" | "chapter" | "runId"> = {
  group: null,
  label: null,
  practice: false,
  adaptive: false,
  itemCount: null,
  items: [],
  startedAt: new Date(0),
  answered: 0,
  correct: 0,
  helpCount: 0,
  lastAnswerAt: null,
  complete: false,
  completedAt: null,
};

/** Upsert a run, filling defaults for every field the update does not itself touch. */
function runOp(
  userId: ObjectId,
  chapter: number,
  runId: string,
  startedAt: Date,
  update: { $set?: Partial<RunDoc>; $inc?: Partial<Record<keyof RunDoc, number>>; $max?: Partial<RunDoc>; $min?: Partial<RunDoc> },
): AnyBulkWriteOperation<RunDoc> {
  const touched = new Set(Object.values(update).flatMap((part) => Object.keys(part ?? {})));
  touched.add("startedAt");
  const defaults = Object.fromEntries(Object.entries(RUN_DEFAULTS).filter(([k]) => !touched.has(k)));
  return {
    updateOne: {
      filter: { userId, chapter, runId },
      update: { ...update, $min: { startedAt, ...update.$min }, $setOnInsert: defaults } as never,
      upsert: true,
    },
  };
}

async function project(userId: ObjectId, fresh: EventDoc[], userAgent: string | null, body: Json) {
  const { attempts, runs, drafts, learningSessions } = await collections();
  const attemptOps: AnyBulkWriteOperation<AttemptDoc>[] = [];
  const runOps: AnyBulkWriteOperation<RunDoc>[] = [];
  const draftDocs: DraftDoc[] = [];

  for (const ev of fresh) {
    const p = ev.payload;
    const runId = str(p.runId, 120);

    switch (ev.type) {
      case "ANSWER_SUBMITTED": {
        const attempt = normaliseAttempt(ev);
        attemptOps.push({
          updateOne: { filter: { userId, eventId: ev.eventId }, update: { $setOnInsert: attempt }, upsert: true },
        });
        if (runId)
          runOps.push(
            runOp(userId, ev.chapter, runId, ev.clientAt, {
              $inc: { answered: 1, correct: attempt.correct ? 1 : 0 },
              $max: { lastAnswerAt: attempt.submittedAt },
            }),
          );
        break;
      }
      case "RUN_STARTED":
      case "CHALLENGE_STARTED": {
        if (!runId) break;
        const items = Array.isArray(p.items) ? p.items.filter(isObj) : [];
        const ids = Array.isArray(p.ids) ? p.ids : [];
        runOps.push(
          runOp(userId, ev.chapter, runId, date(p.startedAt) ?? ev.clientAt, {
            $set: {
              group: num(p.group),
              label: str(p.label, 120),
              practice: bool(p.practice),
              adaptive: bool(p.adaptive),
              itemCount: num(p.itemCount) ?? (items.length || ids.length || null),
              items: items.slice(0, 100).map((q) => ({
                id: str(q.id, 120) ?? "",
                skillId: str(q.skillId ?? q.skill, 60),
                format: str(q.format, 40),
                family: str(q.family, 80),
              })),
            },
          }),
        );
        break;
      }
      case "RUN_COMPLETED":
      case "CHALLENGE_COMPLETED":
        if (runId)
          runOps.push(runOp(userId, ev.chapter, runId, ev.clientAt, { $set: { complete: true, completedAt: ev.clientAt } }));
        break;
      case "HELP_USED":
        if (runId) runOps.push(runOp(userId, ev.chapter, runId, ev.clientAt, { $inc: { helpCount: 1 } }));
        break;
      case "DRAFT_SAVED":
      case "PROOF_DRAFT_SAVED":
      case "TRANSFER_DRAFT_SAVED": {
        const kind = ev.type === "PROOF_DRAFT_SAVED" ? "proof:" : ev.type === "TRANSFER_DRAFT_SAVED" ? "transfer:" : "";
        draftDocs.push({
          userId,
          eventId: ev.eventId,
          chapter: ev.chapter,
          group: kind + String(p.group ?? ""),
          text: typeof p.text === "string" ? p.text.slice(0, 20_000) : "",
          savedAt: date(p.savedAt) ?? ev.clientAt,
          reviewStatus: str(p.reviewStatus, 60) ?? (p.requiresTeacherReview ? "Not teacher reviewed" : null),
          teacherReview: null,
        });
        break;
      }
    }
  }

  // One learning session per page visit
  const sessions = new Map<string, { chapter: number; tabId: string | null; first: Date; last: Date; count: number; exit?: EventDoc }>();
  for (const ev of fresh) {
    const s = sessions.get(ev.sessionId) ?? { chapter: ev.chapter, tabId: ev.tabId, first: ev.clientAt, last: ev.clientAt, count: 0 };
    if (ev.clientAt < s.first) s.first = ev.clientAt;
    if (ev.clientAt > s.last) s.last = ev.clientAt;
    s.count++;
    if (ev.type === "PAGE_EXIT") s.exit = ev;
    sessions.set(ev.sessionId, s);
  }
  const batchSession = str(body.sessionId, 80);
  const batchActive = num(body.activeMs);
  const sessionOps: AnyBulkWriteOperation<LearningSessionDoc>[] = [...sessions].map(([sessionId, s]) => {
    const exitActive = s.exit ? num(s.exit.payload.activeMs) : null;
    const active = Math.max(exitActive ?? 0, sessionId === batchSession ? batchActive ?? 0 : 0);
    return {
      updateOne: {
        filter: { userId, sessionId },
        update: {
          $min: { startedAt: s.first },
          $max: { lastSeenAt: s.last, activeMs: active },
          $inc: { eventCount: s.count },
          ...(s.exit ? { $set: { endedAt: s.exit.clientAt } } : {}),
          $setOnInsert: { tabId: s.tabId, chapter: s.chapter, userAgent },
        },
        upsert: true,
      },
    };
  });

  await Promise.all([
    attemptOps.length && attempts.bulkWrite(attemptOps, { ordered: false }),
    runOps.length && runs.bulkWrite(runOps, { ordered: true }),
    sessionOps.length && learningSessions.bulkWrite(sessionOps, { ordered: false }),
    draftDocs.length && insertIgnoringDuplicates(drafts, draftDocs),
  ]);
}

async function insertIgnoringDuplicates(coll: Awaited<ReturnType<typeof collections>>["drafts"], docs: DraftDoc[]) {
  try {
    await coll.insertMany(docs, { ordered: false });
  } catch (err) {
    if (!(err instanceof MongoBulkWriteError)) throw err;
    const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
    if (writeErrors.some((we) => we.code !== 11000)) throw err;
  }
}

/** Chapter 1 and Chapters 2–14 record answers differently; store one schema for reporting. */
export function normaliseAttempt(ev: EventDoc): AttemptDoc {
  const p = ev.payload;
  const base = {
    userId: ev.userId,
    eventId: ev.eventId,
    sessionId: ev.sessionId,
    chapter: ev.chapter,
    chapterId: ev.chapterId,
    contentVersion: str(p.contentVersion, 40) ?? ev.contentVersion,
    releaseVersion: str(p.releaseVersion, 40) ?? ev.releaseVersion,
    runId: str(p.runId, 120),
    gradedBy: "client" as const,
    receivedAt: ev.receivedAt,
  };

  if (ev.chapter === 1) {
    const mode = str(p.mode, 40) ?? (p.runId ? "challenge" : "practice");
    const hintUsed = bool(p.hintUsed);
    const answerExposed = bool(p.answerExposed);
    const firstAttempt = p.firstAttempt === true;
    return {
      ...base,
      group: num(p.group),
      skillId: str(p.skill ?? p.microSkill, 60) ?? "unknown",
      questionId: str(p.questionId, 120),
      family: str(p.family ?? p.template, 80),
      fingerprint: str(p.fingerprint, 200),
      format: str(p.format, 40),
      difficulty: str(p.difficulty, 40),
      prompt: str(p.prompt, 4000),
      response: p.selected != null ? [p.selected] : [],
      responseText: str(p.selected, 1000),
      expected: p.correctAnswer != null ? [p.correctAnswer] : [],
      answer: str(p.correctAnswer, 1000),
      explanation: str(p.explanation, 4000),
      correct: bool(p.correct),
      mode,
      practice: mode !== "check" && mode !== "challenge" && !p.runId,
      adaptive: bool(p.adaptive),
      supported: hintUsed || answerExposed,
      repeated: p.firstAttempt === false,
      independent: firstAttempt && !hintUsed && !answerExposed && mode !== "explore",
      hintUsed,
      hintCount: hintUsed ? 1 : 0,
      answerExposed,
      answerChanged: typeof p.answerChanged === "boolean" ? p.answerChanged : null,
      pendingChanges: null,
      errorCategory: str(p.errorCategory ?? p.tag, 80),
      activeSeconds: num(p.activeSeconds),
      timingValid: bool(p.timingValid),
      openedAt: date(p.openedAt),
      firstInteractionAt: date(p.firstInteractionAt),
      submittedAt: ev.clientAt,
    };
  }

  const practice = bool(p.practice);
  const adaptive = bool(p.adaptive);
  const hintCount = num(p.hintCount) ?? 0;
  return {
    ...base,
    group: num(p.group),
    skillId: str(p.skillId, 60) ?? "unknown",
    questionId: str(p.questionId, 120),
    family: str(p.family, 80),
    fingerprint: str(p.fingerprint, 200),
    format: str(p.format, 40),
    difficulty: null,
    prompt: str(p.prompt, 4000),
    response: Array.isArray(p.response) ? p.response.slice(0, 50) : [],
    responseText: str(p.responseText, 1000),
    expected: Array.isArray(p.expected) ? p.expected.slice(0, 50) : [],
    answer: str(p.answer, 1000),
    explanation: str(p.explanation, 4000),
    correct: bool(p.correct),
    mode: adaptive ? (practice ? "adaptive-practice" : "adaptive-check") : practice ? "practice" : "challenge",
    practice,
    adaptive,
    supported: p.supported !== false,
    repeated: bool(p.repeated),
    independent: bool(p.independent),
    hintUsed: hintCount > 0,
    hintCount,
    answerExposed: null, // Chapters 2–14 fold exposure into `supported`
    answerChanged: typeof p.answerChanged === "boolean" ? p.answerChanged : null,
    pendingChanges: num(p.pendingChanges),
    errorCategory: null,
    activeSeconds: num(p.activeSeconds),
    timingValid: bool(p.timingValid),
    openedAt: date(p.openedAt),
    firstInteractionAt: date(p.firstInteractionAt),
    submittedAt: date(p.submittedAt) ?? ev.clientAt,
  };
}
