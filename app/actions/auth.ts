"use server";

import { redirect } from "next/navigation";
import { collections, isDuplicateKey } from "@/lib/db";
import { createSession, destroySession, hashPassword, roleForEmail, safeNext, verifyPassword } from "@/lib/auth";
import { verifiedPhone } from "@/lib/phone-token";
import { STUDENT_GRADES, isValidDob } from "@/lib/student-profile";

export type AuthFormState = {
  errors?: Partial<Record<"name" | "email" | "password", string>>;
  message?: string;
  values?: Record<string, string>;
} | undefined;

const field = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);
const clean = (value: unknown, max: number) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

const UNAVAILABLE = "We couldn't reach the Mathology server just now. Please try again in a moment.";

/** The database or session store could not be reached: log the real cause, show a calm message. */
function unavailable(action: string, err: unknown, values: Record<string, string>): AuthFormState {
  console.error(`[auth] ${action} failed:`, err);
  return { message: UNAVAILABLE, values };
}

// ---------------------------------------------------------------------------
// Students: phone + OTP (verified by Firebase in the browser, re-checked here)
// ---------------------------------------------------------------------------

export type PhoneField = "name" | "grade" | "dob" | "school" | "city" | "otp";

export type PhoneAuthResult =
  | { ok: true; next: string }
  | { ok: false; errors?: Partial<Record<PhoneField, string>>; message?: string; unregistered?: boolean };

export type PhoneRegistration = {
  name: string;
  grade: string;
  dob: string;
  school: string;
  city: string;
  idToken: string;
  next?: string;
};

const BAD_OTP: PhoneAuthResult = {
  ok: false,
  errors: { otp: "We couldn't verify your phone number. Request a new OTP." },
};

export async function registerWithPhone(input: PhoneRegistration): Promise<PhoneAuthResult> {
  const name = clean(input.name, 80);
  const grade = clean(input.grade, 2);
  const dob = clean(input.dob, 10);
  const school = clean(input.school, 120);
  const city = clean(input.city, 80);

  const errors: Partial<Record<PhoneField, string>> = {};
  if (name.length < 2) errors.name = "Enter your name.";
  if (!(STUDENT_GRADES as readonly string[]).includes(grade)) errors.grade = "Choose your grade.";
  if (!isValidDob(dob)) errors.dob = "Enter a valid date of birth.";
  if (city.length < 2) errors.city = "Enter your city.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const phone = await verifiedPhone(input.idToken);
  if (!phone) return BAD_OTP;

  try {
    const { users } = await collections();
    const existing = await users.findOne({ phone }, { projection: { _id: 1 } });
    // Already registered with this number: the OTP proves it's them, so just sign in
    if (existing) {
      await users.updateOne({ _id: existing._id }, { $set: { lastLoginAt: new Date() } });
      await createSession(existing._id);
    } else {
      const result = await users.insertOne({
        email: null,
        phone,
        name,
        passwordHash: null,
        role: "student",
        school: school || null,
        className: null,
        grade,
        dob,
        city,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      } as never);
      await createSession(result.insertedId);
    }
  } catch (err) {
    // Two tabs registering the same number at once
    if (isDuplicateKey(err)) return { ok: false, message: "This number was just registered. Sign in instead." };
    console.error("[auth] phone register failed:", err);
    return { ok: false, message: UNAVAILABLE };
  }
  return { ok: true, next: safeNext(input.next) };
}

export async function loginWithPhone(input: { idToken: string; next?: string }): Promise<PhoneAuthResult> {
  const phone = await verifiedPhone(input.idToken);
  if (!phone) return BAD_OTP;

  try {
    const { users } = await collections();
    const user = await users.findOne({ phone }, { projection: { _id: 1 } });
    if (!user) return { ok: false, unregistered: true, message: "There's no account with this number yet." };
    await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    await createSession(user._id);
  } catch (err) {
    console.error("[auth] phone login failed:", err);
    return { ok: false, message: UNAVAILABLE };
  }
  return { ok: true, next: safeNext(input.next) };
}

// ---------------------------------------------------------------------------
// Teachers and accounts made before phone sign-up: email + password
// ---------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email sign-up is only for addresses on MATHOLOGY_TEACHER_EMAILS; students use their phone. */
export async function registerTeacher(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const name = field(form, "name", 80);
  const email = field(form, "email", 160).toLowerCase();
  const password = String(form.get("password") ?? "");
  const values = { name, email };

  const errors: NonNullable<AuthFormState>["errors"] = {};
  if (name.length < 2) errors.name = "Enter your name (at least 2 characters).";
  if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
  else if (roleForEmail(email) !== "teacher")
    errors.email = "This email isn't on the teacher list. Students register with their phone number.";
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    errors.password = "Use at least 8 characters with a letter and a number.";
  if (Object.keys(errors).length) return { errors, values };

  try {
    const { users } = await collections();
    const result = await users.insertOne({
      email,
      phone: null,
      name,
      passwordHash: await hashPassword(password),
      role: "teacher",
      school: null,
      className: null,
      grade: "",
      dob: null,
      city: null,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    } as never);
    await createSession(result.insertedId);
  } catch (err) {
    if (isDuplicateKey(err)) return { errors: { email: "An account with this email already exists. Sign in instead." }, values };
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
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash)))
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
