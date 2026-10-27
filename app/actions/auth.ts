"use server";

import { redirect } from "next/navigation";
import { collections, isDuplicateKey } from "@/lib/db";
import { createSession, destroySession, hashPassword, roleForEmail, safeNext, verifyPassword } from "@/lib/auth";

export type AuthFormState = {
  errors?: Partial<Record<"name" | "email" | "password" | "school" | "className", string>>;
  message?: string;
  values?: Record<string, string>;
} | undefined;

const field = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

/** The database or session store could not be reached: log the real cause, show a calm message. */
function unavailable(action: string, err: unknown, values: Record<string, string>): AuthFormState {
  console.error(`[auth] ${action} failed:`, err);
  return {
    message: "We couldn't reach the Mathology server just now. Please try again in a moment.",
    values,
  };
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const name = field(form, "name", 80);
  const email = field(form, "email", 160).toLowerCase();
  const password = String(form.get("password") ?? "");
  const school = field(form, "school", 120);
  const className = field(form, "className", 40);
  const values = { name, email, school, className };

  const errors: NonNullable<AuthFormState>["errors"] = {};
  if (name.length < 2) errors.name = "Enter your name (at least 2 characters).";
  if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    errors.password = "Use at least 8 characters with a letter and a number.";
  if (Object.keys(errors).length) return { errors, values };

  try {
    const { users } = await collections();
    const result = await users.insertOne({
      email,
      name,
      passwordHash: await hashPassword(password),
      role: roleForEmail(email),
      school: school || null,
      className: className || null,
      grade: "10",
      createdAt: new Date(),
      lastLoginAt: new Date(),
    } as never);
    await createSession(result.insertedId);
  } catch (err) {
    if (isDuplicateKey(err)) return { errors: { email: "An account with this email already exists." }, values };
    return unavailable("register", err, values);
  }

  // Outside the try: redirect() works by throwing
  redirect(safeNext(form.get("next")));
}

export async function login(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = field(form, "email", 160).toLowerCase();
  const password = String(form.get("password") ?? "");
  const values = { email };
  if (!email || !password) return { message: "Enter your email and password.", values };

  try {
    const { users } = await collections();
    const user = await users.findOne({ email });
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return { message: "That email and password don't match.", values };

    await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    await createSession(user._id);
  } catch (err) {
    return unavailable("login", err, values);
  }

  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
