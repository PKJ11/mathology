import "server-only";
import { setServers } from "node:dns";
import { MongoClient, type Db, type ObjectId } from "mongodb";

// ---------------------------------------------------------------------------
// Collection documents
// ---------------------------------------------------------------------------

export type Role = "student" | "teacher" | "admin";

/** Students sign up with an OTP-verified phone; teachers and early accounts use email + password. */
export type UserDoc = {
  _id: ObjectId;
  email: string | null;
  phone: string | null; // E.164, from a verified Firebase token
  name: string;
  passwordHash: string | null;
  role: Role;
  school: string | null;
  className: string | null;
  grade: string;
  dob: string | null; // YYYY-MM-DD
  city: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
};

export type AuthSessionDoc = {
  _id: string; // sha256 of the cookie token
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string | null;
};

/** Append-only action log: one document per learner interaction. */
export type EventDoc = {
  _id?: ObjectId;
  userId: ObjectId;
  eventId: string;
  type: string;
  sessionId: string;
  tabId: string | null;
  seq: number | null;
  chapter: number;
  chapterId: string | null;
  route: string | null;
  clientAt: Date;
  receivedAt: Date;
  contentVersion: string | null;
  releaseVersion: string | null;
  source: "tracker" | "chapter-log";
  payload: Record<string, unknown>;
};

/** One submitted answer, normalised across the Chapter 1 and Chapter 2–14 schemas. */
export type AttemptDoc = {
  userId: ObjectId;
  eventId: string;
  sessionId: string;
  chapter: number;
  chapterId: string | null;
  contentVersion: string | null;
  releaseVersion: string | null;
  runId: string | null;
  group: number | null;
  skillId: string;
  questionId: string | null;
  family: string | null;
  fingerprint: string | null;
  format: string | null;
  difficulty: string | null;
  prompt: string | null;
  response: unknown[];
  responseText: string | null;
  expected: unknown[];
  answer: string | null;
  explanation: string | null;
  correct: boolean;
  gradedBy: "client";
  mode: string;
  practice: boolean;
  adaptive: boolean;
  supported: boolean;
  repeated: boolean;
  independent: boolean;
  hintUsed: boolean;
  hintCount: number;
  answerExposed: boolean | null;
  answerChanged: boolean | null;
  pendingChanges: number | null;
  errorCategory: string | null;
  activeSeconds: number | null;
  timingValid: boolean;
  openedAt: Date | null;
  firstInteractionAt: Date | null;
  submittedAt: Date;
  receivedAt: Date;
};

/** A practice / challenge / readiness / adaptive run. */
export type RunDoc = {
  userId: ObjectId;
  chapter: number;
  runId: string;
  group: number | null;
  label: string | null;
  practice: boolean;
  adaptive: boolean;
  itemCount: number | null;
  items: { id: string; skillId: string | null; format: string | null; family: string | null }[];
  startedAt: Date;
  answered: number;
  correct: number;
  helpCount: number;
  lastAnswerAt: Date | null;
  complete: boolean;
  completedAt: Date | null;
};

/** One browser visit to a chapter (page load → page exit). */
export type LearningSessionDoc = {
  userId: ObjectId;
  sessionId: string;
  tabId: string | null;
  chapter: number;
  startedAt: Date;
  lastSeenAt: Date;
  endedAt?: Date | null;
  activeMs?: number;
  eventCount: number;
  userAgent: string | null;
};

/** Every saved version of a written reasoning draft (the chapters only keep the latest). */
export type DraftDoc = {
  userId: ObjectId;
  eventId: string;
  chapter: number;
  group: string;
  text: string;
  savedAt: Date;
  reviewStatus: string | null;
  teacherReview: { reviewerId: ObjectId; grade: string | null; comment: string | null; reviewedAt: Date } | null;
};

/** Latest raw localStorage snapshot of each chapter store, for cross-device resume. */
export type ChapterStateDoc = {
  userId: ObjectId;
  chapter: number;
  key: string;
  raw: string;
  bytes: number;
  savedAt: Date;
  updatedAt: Date;
};

/** Temporary: a free demo-class booking, keyed by the OTP-verified phone and the student's name. */
export type DemoRegistrationDoc = {
  _id?: ObjectId;
  phone: string; // E.164, from the verified Firebase token
  nameKey: string;
  name: string;
  grade: string;
  school: string;
  date: string; // YYYY-MM-DD, India time
  slot: string;
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const globalForMongo = globalThis as unknown as {
  mathologyMongo?: Promise<MongoClient>;
  mathologyIndexes?: Promise<void>;
};

function client(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  // Some local networks (often on Windows) refuse Node's SRV lookups for mongodb+srv:// URIs.
  // Opt in to specific resolvers with e.g. MONGODB_DNS_SERVERS="8.8.8.8,1.1.1.1".
  const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (dnsServers?.length) setServers(dnsServers);
  globalForMongo.mathologyMongo ??= new MongoClient(uri, { appName: "mathology", serverSelectionTimeoutMS: 10_000 })
    .connect()
    .catch((err) => {
      globalForMongo.mathologyMongo = undefined;
      throw err;
    });
  return globalForMongo.mathologyMongo;
}

export async function getDb(): Promise<Db> {
  const db = (await client()).db(process.env.MONGODB_DB || "mathology");
  globalForMongo.mathologyIndexes ??= ensureIndexes(db).catch((err) => {
    globalForMongo.mathologyIndexes = undefined;
    throw err;
  });
  await globalForMongo.mathologyIndexes;
  return db;
}

export async function collections() {
  const db = await getDb();
  return {
    users: db.collection<UserDoc>("users"),
    authSessions: db.collection<AuthSessionDoc>("auth_sessions"),
    events: db.collection<EventDoc>("events"),
    attempts: db.collection<AttemptDoc>("attempts"),
    runs: db.collection<RunDoc>("runs"),
    learningSessions: db.collection<LearningSessionDoc>("learning_sessions"),
    drafts: db.collection<DraftDoc>("drafts"),
    chapterState: db.collection<ChapterStateDoc>("chapter_state"),
    demoRegistrations: db.collection<DemoRegistrationDoc>("demo_registrations"),
  };
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    uniqueWhenSet(db, "users", "email"),
    uniqueWhenSet(db, "users", "phone"),
    db.collection("auth_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("auth_sessions").createIndex({ userId: 1 }),

    db.collection("events").createIndex({ userId: 1, eventId: 1 }, { unique: true }),
    db.collection("events").createIndex({ userId: 1, chapter: 1, clientAt: 1 }),
    db.collection("events").createIndex({ userId: 1, type: 1, clientAt: 1 }),
    db.collection("events").createIndex({ sessionId: 1, seq: 1 }),

    db.collection("attempts").createIndex({ userId: 1, eventId: 1 }, { unique: true }),
    db.collection("attempts").createIndex({ userId: 1, chapter: 1, skillId: 1, submittedAt: 1 }),
    db.collection("attempts").createIndex({ userId: 1, runId: 1 }),

    db.collection("runs").createIndex({ userId: 1, chapter: 1, runId: 1 }, { unique: true }),
    db.collection("runs").createIndex({ userId: 1, startedAt: -1 }),

    db.collection("learning_sessions").createIndex({ userId: 1, sessionId: 1 }, { unique: true }),
    db.collection("learning_sessions").createIndex({ userId: 1, startedAt: -1 }),

    db.collection("drafts").createIndex({ userId: 1, eventId: 1 }, { unique: true }),
    db.collection("drafts").createIndex({ userId: 1, chapter: 1, group: 1, savedAt: -1 }),

    db.collection("chapter_state").createIndex({ userId: 1, chapter: 1, key: 1 }, { unique: true }),

    db.collection("demo_registrations").createIndex({ phone: 1, nameKey: 1 }, { unique: true }),
    db.collection("demo_registrations").createIndex({ date: 1, slot: 1 }),
  ]);
}

/**
 * Unique only among documents that have the field, so phone-only and email-only accounts can coexist.
 * Replaces the original plain unique email index the first time it runs.
 */
async function uniqueWhenSet(db: Db, collection: string, field: string) {
  const coll = db.collection(collection);
  const name = `${field}_1`;
  const existing = (await coll.listIndexes().toArray()).find((i) => i.name === name);
  // Another server instance may have dropped it first
  if (existing && !existing.partialFilterExpression) await coll.dropIndex(name).catch(() => {});
  await coll.createIndex({ [field]: 1 }, { name, unique: true, partialFilterExpression: { [field]: { $type: "string" } } });
}

export const isDuplicateKey = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
