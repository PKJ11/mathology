"use server";

import { createRemoteJWKSet, jwtVerify } from "jose";
import firebaseConfig from "@/app/config/firebaseConfig";
import { collections } from "@/lib/db";
import { DEMO_DATES, DEMO_GRADES, isSlotOpen } from "@/lib/demo-class";

export type DemoInput = {
  name: string;
  grade: string;
  school: string;
  date: string;
  slot: string;
  /** Firebase ID token from the phone OTP sign-in; the phone number is read from it, never from the form. */
  idToken: string;
};

export type DemoField = "name" | "grade" | "school" | "date" | "slot" | "otp";

export type DemoResult =
  | { ok: true; phone: string; updated: boolean }
  | { ok: false; errors?: Partial<Record<DemoField, string>>; message?: string };

// Firebase ID tokens are signed with these public keys: https://firebase.google.com/docs/auth/admin/verify-id-tokens
const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

async function verifiedPhone(idToken: string): Promise<string | null> {
  const { projectId } = firebaseConfig;
  try {
    const { payload } = await jwtVerify(idToken, firebaseKeys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return typeof payload.phone_number === "string" ? payload.phone_number : null;
  } catch {
    return null;
  }
}

const clean = (value: unknown, max: number) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function registerDemo(input: DemoInput): Promise<DemoResult> {
  const name = clean(input.name, 80);
  const grade = clean(input.grade, 2);
  const school = clean(input.school, 120);
  const date = clean(input.date, 10);
  const slot = clean(input.slot, 10);

  const errors: Partial<Record<DemoField, string>> = {};
  if (name.length < 2) errors.name = "Enter the student's name.";
  if (!(DEMO_GRADES as readonly string[]).includes(grade)) errors.grade = "Choose Grade 7 or 8.";
  if (school.length < 2) errors.school = "Enter the school name.";
  if (!(DEMO_DATES as readonly string[]).includes(date)) errors.date = "Choose a date.";
  else if (!isSlotOpen(date, slot)) errors.slot = "That time has passed or isn't available. Choose another.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const phone = await verifiedPhone(String(input.idToken ?? ""));
  if (!phone) return { ok: false, errors: { otp: "We couldn't verify your phone number. Request a new OTP." } };

  try {
    const { demoRegistrations } = await collections();
    const now = new Date();
    // One booking per student per phone: registering again moves the booking
    const result = await demoRegistrations.updateOne(
      { phone, nameKey: name.toLowerCase() },
      { $set: { name, grade, school, date, slot, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return { ok: true, phone, updated: !result.upsertedId };
  } catch (err) {
    console.error("[demo] registration failed:", err);
    return { ok: false, message: "We couldn't save your registration just now. Please try again in a moment." };
  }
}
