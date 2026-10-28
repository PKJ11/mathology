"use client";

import { useEffect, useRef, useState } from "react";
import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";

const RESEND_SECONDS = 30;

declare global {
  interface Window {
    grecaptcha?: { reset: (widgetId?: number) => void };
  }
}

export type OtpProblem = { field: "phone" | "otp" | null; message: string };
export type OtpResult<T = object> = ({ ok: true } & T) | ({ ok: false } & OtpProblem);

function problem(err: unknown): OtpProblem {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-phone-number":
      return { field: "phone", message: "That phone number doesn't look right." };
    case "auth/invalid-verification-code":
      return { field: "otp", message: "That OTP is incorrect. Check the SMS and try again." };
    case "auth/code-expired":
      return { field: "otp", message: "That OTP has expired. Request a new one." };
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return { field: null, message: "Too many attempts from this device. Please wait a while and try again." };
    case "auth/network-request-failed":
      return { field: null, message: "No connection. Check your internet and try again." };
    default:
      console.error("[otp] phone verification failed:", err);
      return { field: null, message: "We couldn't send or check the OTP just now. Please try again." };
  }
}

/**
 * Firebase phone OTP for Indian mobile numbers. Firebase is loaded on first use, and the
 * returned ID token is what the server checks, so the phone number can't be spoofed.
 * Render `<div ref={otp.recaptchaRef} />` somewhere that stays mounted.
 */
export function usePhoneOtp() {
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const auth = useRef<Auth | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);

  const [sent, setSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => () => verifier.current?.clear(), []);

  const resetRecaptcha = async () => {
    try {
      const id = await verifier.current?.render();
      window.grecaptcha?.reset(id);
    } catch {
      verifier.current = null;
    }
  };

  /** Texts an OTP to +91 `digits`. */
  const send = async (digits: string): Promise<OtpResult> => {
    try {
      const { firebaseAuth } = await import("@/lib/firebase-client");
      const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
      auth.current ??= firebaseAuth();
      verifier.current ??= new RecaptchaVerifier(auth.current, recaptchaRef.current!, { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth.current, `+91${digits}`, verifier.current);
      setSent(true);
      setResendIn(RESEND_SECONDS);
      return { ok: true };
    } catch (err) {
      await resetRecaptcha();
      return { ok: false, ...problem(err) };
    }
  };

  /** Checks the code and returns a Firebase ID token for the server. */
  const confirm = async (code: string): Promise<OtpResult<{ idToken: string }>> => {
    if (!confirmation.current) return { ok: false, field: "otp", message: "Request an OTP first." };
    try {
      const credential = await confirmation.current.confirm(code);
      return { ok: true, idToken: await credential.user.getIdToken() };
    } catch (err) {
      return { ok: false, ...problem(err) };
    }
  };

  /** The Firebase session only proved the number; Mathology keeps its own. */
  const finish = async () => {
    if (!auth.current) return;
    const { signOut } = await import("firebase/auth");
    await signOut(auth.current).catch(() => {});
  };

  /** Back to entering a phone number. */
  const reset = () => {
    confirmation.current = null;
    setSent(false);
    setResendIn(0);
  };

  return { recaptchaRef, sent, resendIn, send, confirm, finish, reset };
}
