"use client";

import { useEffect, useRef, useState } from "react";
import { registerDemo, type DemoField } from "./actions/demo";
import { usePhoneOtp } from "./use-phone-otp";
import {
  DEMO_DATES,
  DEMO_GRADES,
  dateLabel,
  demoIsRunning,
  isDateOpen,
  isSlotOpen,
  slotForGrade,
  slotLabel,
} from "@/lib/demo-class";
import { isIndianMobile } from "@/lib/student-profile";
import styles from "./demo-class.module.css";

const SEEN_KEY = "mth_demo_popup_seen";
// The first-visit popup opens this long after the homepage entrance animation ends
const POPUP_DELAY_MS = 3000;

type Field = DemoField | "phone";
type Values = { name: string; grade: string; school: string; date: string; slot: string; phone: string; otp: string };
type Booked = { name: string; grade: string; date: string; slot: string; phone: string; updated: boolean };

const EMPTY: Values = { name: "", grade: "", school: "", date: "", slot: "", phone: "", otp: "" };

/** "Register for demo class" button plus the registration popup, which also opens once on a visitor's first visit. */
export function DemoClass({ className, ...button }: React.ComponentProps<"button">) {
  const dialog = useRef<HTMLDialogElement>(null);
  const otp = usePhoneOtp();

  const [running] = useState(() => demoIsRunning());
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
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

    // Wait for the page's entrance animation to finish (looping ones never do, so skip them), then a pause
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const entrance = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity))
      .map((a) => a.finished);
    Promise.allSettled(entrance).then(() => {
      if (cancelled) return;
      timer = setTimeout(() => {
        try {
          localStorage.setItem(SEEN_KEY, "1");
        } catch {}
        if (!dialog.current?.open) dialog.current?.showModal();
      }, POPUP_DELAY_MS);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running]);

  if (!running) return null;

  const set = (key: keyof Values, value: string) => {
    setValues((v) => {
      const next = { ...v, [key]: value };
      // Grade 7 and 8 each have one class time; drop a date that time has already passed on
      if (key === "grade") {
        next.slot = slotForGrade(value) ?? "";
        if (next.date && !isSlotOpen(next.date, next.slot)) next.date = "";
      }
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
    setMessage(null);
  };

  const validate = () => {
    const e: Partial<Record<Field, string>> = {};
    if (values.name.trim().length < 2) e.name = "Enter the student's name.";
    if (!values.grade) e.grade = "Choose a grade.";
    if (values.school.trim().length < 2) e.school = "Enter the school name.";
    if (!values.date) e.date = "Choose a date.";
    else if (values.slot && !isSlotOpen(values.date, values.slot)) e.date = "That class has already started. Choose another date.";
    if (!isIndianMobile(values.phone)) e.phone = "Enter a 10-digit mobile number.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const showProblem = (p: { field: "phone" | "otp" | null; message: string }) => {
    if (p.field) setErrors((e) => ({ ...e, [p.field!]: p.message }));
    else setMessage(p.message);
  };

  const sendOtp = async () => {
    if (!validate()) return;
    setBusy("send");
    setMessage(null);
    const sent = await otp.send(values.phone);
    if (sent.ok) setValues((v) => ({ ...v, otp: "" }));
    else showProblem(sent);
    setBusy(null);
  };

  const verifyAndRegister = async () => {
    if (!validate()) return;
    if (!/^\d{6}$/.test(values.otp)) {
      setErrors((e) => ({ ...e, otp: "Enter the 6-digit OTP." }));
      return;
    }
    setBusy("verify");
    setMessage(null);
    try {
      const checked = await otp.confirm(values.otp);
      if (!checked.ok) return showProblem(checked);

      const result = await registerDemo({ ...values, idToken: checked.idToken });
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.message ?? null);
        return;
      }
      setBooked({ ...values, phone: result.phone, updated: result.updated });
      await otp.finish();
    } catch (err) {
      console.error("[demo] registration failed:", err);
      setMessage("We couldn't reach the Mathology server just now. Please try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const changePhone = () => {
    otp.reset();
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
      <button {...button} type="button" className={className} onClick={open} aria-haspopup="dialog">
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
                if (otp.sent) verifyAndRegister();
                else sendOtp();
              }}
            >
              <header className={styles.head}>
                <span className={styles.tag}>Free · Grades 7 &amp; 8</span>
                <h2 id="demo-title">Register for a demo class</h2>
                <p className={styles.lead}>A live, hands-on maths class. Grade 7 meets 4 – 5 pm and Grade 8 meets 5 – 6 pm. Pick a day that suits you.</p>
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
                      disabled={values.slot ? !isSlotOpen(d, values.slot) : !isDateOpen(d)}
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
                {values.slot ? (
                  <div className={styles.choices}>
                    <Choice name="slot" value={values.slot} checked onChange={() => {}}>
                      {slotLabel(values.slot)}
                    </Choice>
                  </div>
                ) : (
                  <small>Choose a grade to see the class time.</small>
                )}
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
                    readOnly={otp.sent}
                    aria-invalid={errors.phone ? true : undefined}
                  />
                  {otp.sent && (
                    <button type="button" className={styles.inline} onClick={changePhone}>
                      Change
                    </button>
                  )}
                </div>
                {errors.phone && <small className={styles.error}>{errors.phone}</small>}
              </div>

              {otp.sent && (
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
                  <button type="button" className={styles.inline} disabled={otp.resendIn > 0 || !!busy} onClick={sendOtp}>
                    {otp.resendIn > 0 ? `Resend OTP in ${otp.resendIn}s` : "Resend OTP"}
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
                    : otp.sent
                      ? "Verify & register"
                      : "Send OTP"}
              </button>
            </form>
          )}
          {/* Invisible reCAPTCHA required by Firebase phone sign-in; kept mounted across steps */}
          <div ref={otp.recaptchaRef} />
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
