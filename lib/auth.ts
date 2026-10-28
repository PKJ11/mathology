import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections, type Role, type UserDoc } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "mth_session";
const SESSION_DAYS = 30;

export type CurrentUser = Pick<UserDoc, "email" | "phone" | "name" | "role" | "school" | "className" | "grade"> & {
  id: string;
};

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Sessions (opaque random token in an httpOnly cookie, hash stored in MongoDB)
// ---------------------------------------------------------------------------

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: ObjectId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const { authSessions } = await collections();
  await authSessions.insertOne({
    _id: tokenHash(token),
    userId,
    createdAt: new Date(),
    expiresAt,
    userAgent: (await headers()).get("user-agent"),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const { authSessions } = await collections();
    await authSessions.deleteOne({ _id: tokenHash(token) });
  }
  store.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { authSessions, users } = await collections();
  const session = await authSessions.findOne({ _id: tokenHash(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await users.findOne({ _id: session.userId }, { projection: { passwordHash: 0 } });
  if (!user) return null;
  return {
    id: user._id.toHexString(),
    email: user.email ?? null,
    phone: user.phone ?? null,
    name: user.name,
    role: user.role,
    school: user.school,
    className: user.className,
    grade: user.grade,
  };
});

export async function requireUser(next?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export const canViewOthers = (role: Role) => role === "teacher" || role === "admin";

export function roleForEmail(email: string): Role {
  const teachers = (process.env.MATHOLOGY_TEACHER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return teachers.includes(email) ? "teacher" : "student";
}

/** Only allow same-site relative redirects after login. */
export function safeNext(value: FormDataEntryValue | string | null | undefined) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/chapters";
}

export const toObjectId = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
