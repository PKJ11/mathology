"use client";

import { useEffect, useRef, useState } from "react";
import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { registerDemo, type DemoField } from "./actions/demo";
import {
  DEMO_DATES,
  DEMO_GRADES,
  DEMO_SLOTS,
  dateLabel,
  demoIsRunning,
  isDateOpen,
  isSlotOpen,
  slotLabel,
} from "@/lib/demo-class";
import styles from "./demo-class.module.css";

const SEEN_KEY = "mth_demo_popup_seen";
const RESEND_SECONDS = 30;

type Field = DemoField | "phone";
type Values = { name: string; grade: string; school: string; date: string; slot: string; phone: string; otp: string };
type Booked = { name: string; grade: string; date: string; slot: string; phone: string; updated: boolean };

const EMPTY: Values = { name: "", grade: "", school: "", date: "", slot: "", phone: "", otp: "" };

declare global {
  interface Window {
    grecaptcha?: { reset: (widgetId?: number) => void };
  }
}

const firebaseMessage = (err: unknown) => {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-phone-number":
      return { field: "phone" as const, text: "That phone number doesn't look right." };
    case "auth/invalid-verification-code":
      return { field: "otp" as const, text: "That OTP is incorrect. Check the SMS and try again." };
    case "auth/code-expired":
      return { field: "otp" as const, text: "That OTP has expired. Request a new one." };
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return { field: null, text: "Too many attempts from this device. Please wait a while and try again." };
    case "auth/network-request-failed":
      return { field: null, text: "No connection. Check your internet and try again." };
    default:
      console.error("[demo] phone verification failed:", err);
      return { field: null, text: "We couldn't send or check the OTP just now. Please try again." };
  }
};

/** "Register for demo class" button plus the registration popup, which also opens once on a visitor's first visit. */
export function DemoClass({ className }: { className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const recaptchaBox = useRef<HTMLDivElement>(null);
  const auth = useRef<Auth | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);

  const [running] = useState(() => demoIsRunning());
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);

  const open = () => dialog.current?.showModal();

  // First visit to the home page: open the popup once
  useEffect(() => {
    if (!running) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(SEEN_KEY);
    } catch {
      // Storage blocked (private mode): don't nag on every visit
    }
    if (seen) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {}
      if (!dialog.current?.open) dialog.current?.showModal();
    }, 900);
    return () => clearTimeout(timer);
  }, [running]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => () => verifier.current?.clear(), []);

  if (!running) return null;

  const set = (key: keyof Values, value: string) => {
    setValues((v) => ({ ...v, [key]: value, ...(key === "date" && !isSlotOpen(value, v.slot) ? { slot: "" } : {}) }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setMessage(null);
  };

  const validate = () => {
    const e: Partial<Record<Field, string>> = {};
    if (values.name.trim().length < 2) e.name = "Enter the student's name.";
    if (!values.grade) e.grade = "Choose a grade.";
    if (values.school.trim().length < 2) e.school = "Enter the school name.";
    if (!values.date) e.date = "Choose a date.";
    if (!values.slot) e.slot = "Choose a time.";
    if (!/^[6-9]\d{9}$/.test(values.phone)) e.phone = "Enter a 10-digit mobile number.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetRecaptcha = async () => {
    try {
      const id = await verifier.current?.render();
      window.grecaptcha?.reset(id);
    } catch {
      verifier.current = null;
    }
  };

  const sendOtp = async () => {
    if (!validate()) return;
    setBusy("send");
    setMessage(null);
    try {
      const { firebaseAuth } = await import("@/lib/firebase-client");
      const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
      auth.current ??= firebaseAuth();
      verifier.current ??= new RecaptchaVerifier(auth.current, recaptchaBox.current!, { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth.current, `+91${values.phone}`, verifier.current);
      setOtpSent(true);
      setResendIn(RESEND_SECONDS);
      setValues((v) => ({ ...v, otp: "" }));
    } catch (err) {
      const { field, text } = firebaseMessage(err);
      if (field) setErrors((e) => ({ ...e, [field]: text }));
      else setMessage(text);
      await resetRecaptcha();
    } finally {
      setBusy(null);
    }
  };

  const verifyAndRegister = async () => {
    if (!validate()) return;
    if (!/^\d{6}$/.test(values.otp)) {
      setErrors((e) => ({ ...e, otp: "Enter the 6-digit OTP." }));
      return;
    }
    if (!confirmation.current) return;
    setBusy("verify");
    setMessage(null);
    try {
      let idToken: string;
      try {
        const credential = await confirmation.current.confirm(values.otp);
        idToken = await credential.user.getIdToken();
      } catch (err) {
        const { field, text } = firebaseMessage(err);
        if (field) setErrors((e) => ({ ...e, [field]: text }));
        else setMessage(text);
        return;
      }

      const result = await registerDemo({ ...values, idToken });
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.message ?? null);
        return;
      }
      setBooked({ ...values, phone: result.phone, updated: result.updated });
      // The Firebase sign-in only proved the phone number; Mathology accounts are separate
      const { signOut } = await import("firebase/auth");
      if (auth.current) await signOut(auth.current).catch(() => {});
    } catch (err) {
      console.error("[demo] registration failed:", err);
      setMessage("We couldn't reach the Mathology server just now. Please try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const changePhone = () => {
    confirmation.current = null;
    setOtpSent(false);
    setResendIn(0);
    setValues((v) => ({ ...v, otp: "" }));
    setErrors((e) => ({ ...e, otp: undefined }));
  };

  const onClose = () => {
    if (!booked) return;
    // Next registration (e.g. a sibling) starts fresh
    setBooked(null);
    setValues(EMPTY);
    changePhone();
  };

  return (
    <>
      <button type="button" className={className} onClick={open} aria-haspopup="dialog">
        Register for
        <br />
        demo class
      </button>

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="demo-title"
        onClose={onClose}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <div className={styles.panel}>
          <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {booked ? (
            <div className={styles.done} role="status">
              <div className={styles.tick} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
              <h2 id="demo-title">{booked.updated ? "Booking updated!" : "You're registered!"}</h2>
              <p className={styles.summary}>
                <strong>{booked.name}</strong> · Grade {booked.grade}
                <br />
                {dateLabel(booked.date)} · {slotLabel(booked.slot)}
              </p>
              <p className={styles.lead}>We&rsquo;ll contact you on {booked.phone} with the class details.</p>
              <button type="button" className={styles.submit} onClick={() => dialog.current?.close()}>
                Done
              </button>
            </div>
          ) : (
            <form
              className={styles.form}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (otpSent) verifyAndRegister();
                else sendOtp();
              }}
            >
              <header className={styles.head}>
                <span className={styles.tag}>Free · Grades 7 &amp; 8</span>
                <h2 id="demo-title">Register for a demo class</h2>
                <p className={styles.lead}>A live, hands-on maths class. Pick a day and time that suits you.</p>
              </header>

              <label className={styles.field}>
                <span>Student&rsquo;s name</span>
                <input
                  value={values.name}
                  onChange={(e) => set("name", e.target.value)}
                  autoComplete="name"
                  maxLength={80}
                  aria-invalid={errors.name ? true : undefined}
                />
                {errors.name && <small className={styles.error}>{errors.name}</small>}
              </label>

              <fieldset className={styles.field}>
                <legend>Grade</legend>
                <div className={styles.choices}>
                  {DEMO_GRADES.map((g) => (
                    <Choice key={g} name="grade" value={g} checked={values.grade === g} onChange={() => set("grade", g)}>
                      Grade {g}
                    </Choice>
                  ))}
                </div>
                {errors.grade && <small className={styles.error}>{errors.grade}</small>}
              </fieldset>

              <label className={styles.field}>
                <span>School</span>
                <input
                  value={values.school}
                  onChange={(e) => set("school", e.target.value)}
                  autoComplete="organization"
                  maxLength={120}
                  aria-invalid={errors.school ? true : undefined}
                />
                {errors.school && <small className={styles.error}>{errors.school}</small>}
              </label>

              <fieldset className={styles.field}>
                <legend>Date (November)</legend>
                <div className={`${styles.choices} ${styles.dates}`}>
                  {DEMO_DATES.map((d) => (
                    <Choice
                      key={d}
                      name="date"
                      value={d}
                      checked={values.date === d}
                      disabled={!isDateOpen(d)}
                      onChange={() => set("date", d)}
                    >
                      {dateLabel(d)}
                    </Choice>
                  ))}
                </div>
                {errors.date && <small className={styles.error}>{errors.date}</small>}
              </fieldset>

              <fieldset className={styles.field}>
                <legend>Time</legend>
                <div className={styles.choices}>
                  {DEMO_SLOTS.map((s) => (
                    <Choice
                      key={s.id}
                      name="slot"
                      value={s.id}
                      checked={values.slot === s.id}
                      disabled={!!values.date && !isSlotOpen(values.date, s.id)}
                      onChange={() => set("slot", s.id)}
                    >
                      {s.label}
                    </Choice>
                  ))}
                </div>
                {errors.slot && <small className={styles.error}>{errors.slot}</small>}
              </fieldset>

              <div className={styles.field}>
                <label htmlFor="demo-phone">Phone number</label>
                <div className={styles.phone}>
                  <span aria-hidden="true">+91</span>
                  <input
                    id="demo-phone"
                    value={values.phone}
                    onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(-10))}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="10-digit mobile number"
                    readOnly={otpSent}
                    aria-invalid={errors.phone ? true : undefined}
                  />
                  {otpSent && (
                    <button type="button" className={styles.inline} onClick={changePhone}>
                      Change
                    </button>
                  )}
                </div>
                {errors.phone && <small className={styles.error}>{errors.phone}</small>}
              </div>

              {otpSent && (
                <div className={styles.field}>
                  <label htmlFor="demo-otp">OTP</label>
                  <input
                    id="demo-otp"
                    value={values.otp}
                    onChange={(e) => set("otp", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    autoFocus
                    className={styles.otp}
                    aria-invalid={errors.otp ? true : undefined}
                  />
                  {errors.otp ? (
                    <small className={styles.error}>{errors.otp}</small>
                  ) : (
                    <small>Sent by SMS to +91 {values.phone}.</small>
                  )}
                  <button type="button" className={styles.inline} disabled={resendIn > 0 || !!busy} onClick={sendOtp}>
                    {resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}
                  </button>
                </div>
              )}

              {message && (
                <p className={styles.error} role="alert">
                  {message}
                </p>
              )}

              <button type="submit" className={styles.submit} disabled={!!busy}>
                {busy === "send"
                  ? "Sending OTP…"
                  : busy === "verify"
                    ? "Verifying…"
                    : otpSent
                      ? "Verify & register"
                      : "Send OTP"}
              </button>
            </form>
          )}
          {/* Invisible reCAPTCHA required by Firebase phone sign-in; kept mounted across steps */}
          <div ref={recaptchaBox} />
        </div>
      </dialog>
    </>
  );
}

function Choice({
  name,
  value,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.choice}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}
