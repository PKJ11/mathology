"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { loginWithPhone, registerWithPhone, type PhoneField } from "../actions/auth";
import { usePhoneOtp } from "../use-phone-otp";
import { STUDENT_GRADES, dobRange, isIndianMobile, isValidDob } from "@/lib/student-profile";
import styles from "./auth.module.css";

type Props = { mode: "login" | "register"; next?: string };
type Field = PhoneField | "phone";
type Values = Record<"name" | "grade" | "dob" | "school" | "city" | "phone" | "otp", string>;

const EMPTY: Values = { name: "", grade: "", dob: "", school: "", city: "", phone: "", otp: "" };

/** Students register and sign in with a phone number and an SMS OTP. */
export function PhoneForm({ mode, next }: Props) {
  const otp = usePhoneOtp();
  // Kept after a successful OTP so fixing a form error doesn't need a new SMS
  const idToken = useRef<string | null>(null);
  const [range] = useState(() => dobRange());
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [unregistered, setUnregistered] = useState(false);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);

  const register = mode === "register";
  const query = next ? `?next=${encodeURIComponent(next)}` : "";

  const set = (key: keyof Values, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setMessage(null);
  };

  const validate = () => {
    const e: Partial<Record<Field, string>> = {};
    if (register) {
      if (values.name.trim().length < 2) e.name = "Enter your name.";
      if (!values.grade) e.grade = "Choose your grade.";
      if (!isValidDob(values.dob)) e.dob = "Enter a valid date of birth.";
      if (values.city.trim().length < 2) e.city = "Enter your city.";
    }
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
    setUnregistered(false);
    const sent = await otp.send(values.phone);
    if (sent.ok) setValues((v) => ({ ...v, otp: "" }));
    else showProblem(sent);
    setBusy(null);
  };

  const verify = async () => {
    if (!validate()) return;
    if (!idToken.current && !/^\d{6}$/.test(values.otp)) {
      setErrors((e) => ({ ...e, otp: "Enter the 6-digit OTP." }));
      return;
    }
    setBusy("verify");
    setMessage(null);
    let leaving = false;
    try {
      if (!idToken.current) {
        const checked = await otp.confirm(values.otp);
        if (!checked.ok) return showProblem(checked);
        idToken.current = checked.idToken;
      }
      const result = register
        ? await registerWithPhone({ ...values, idToken: idToken.current, next })
        : await loginWithPhone({ idToken: idToken.current, next });
      if (result.ok) {
        await otp.finish();
        // Full load so every server component picks up the new session
        leaving = true;
        window.location.assign(result.next);
        return;
      }
      setErrors(result.errors ?? {});
      setMessage(result.message ?? null);
      setUnregistered(!!result.unregistered);
      if (result.errors?.otp) changePhone();
    } catch (err) {
      console.error("[auth] phone sign-in failed:", err);
      setMessage("We couldn't reach the Mathology server just now. Please try again in a moment.");
    } finally {
      if (!leaving) setBusy(null);
    }
  };

  const changePhone = () => {
    otp.reset();
    idToken.current = null;
    setValues((v) => ({ ...v, otp: "" }));
  };

  const input = (key: keyof Values) => ({
    id: `phone-form-${key}`,
    name: key,
    value: values[key],
    "aria-invalid": errors[key as Field] ? true : undefined,
    "aria-describedby": errors[key as Field] ? `phone-form-${key}-error` : undefined,
  });
  const error = (key: Field) =>
    errors[key] ? (
      <small id={`phone-form-${key}-error`} className={styles.fieldError}>
        {errors[key]}
      </small>
    ) : null;

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (otp.sent) verify();
        else sendOtp();
      }}
    >
      {register && (
        <>
          <label className={styles.field}>
            <span>Full name</span>
            <input {...input("name")} autoComplete="name" maxLength={80} onChange={(e) => set("name", e.target.value)} />
            {error("name")}
          </label>

          <div className={styles.row}>
            <label className={styles.field}>
              <span>Grade</span>
              <select {...input("grade")} onChange={(e) => set("grade", e.target.value)}>
                <option value="" disabled>
                  Select
                </option>
                {STUDENT_GRADES.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
              {error("grade")}
            </label>
            <label className={styles.field}>
              <span>Date of birth</span>
              <input
                {...input("dob")}
                type="date"
                min={range.min}
                max={range.max}
                autoComplete="bday"
                onChange={(e) => set("dob", e.target.value)}
              />
              {error("dob")}
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              <span>School (optional)</span>
              <input
                {...input("school")}
                autoComplete="organization"
                maxLength={120}
                onChange={(e) => set("school", e.target.value)}
              />
              {error("school")}
            </label>
            <label className={styles.field}>
              <span>City</span>
              <input
                {...input("city")}
                autoComplete="address-level2"
                maxLength={80}
                onChange={(e) => set("city", e.target.value)}
              />
              {error("city")}
            </label>
          </div>
        </>
      )}

      <div className={styles.field}>
        <label htmlFor="phone-form-phone">Phone number</label>
        <div className={styles.phone}>
          <span aria-hidden="true">+91</span>
          <input
            {...input("phone")}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="10-digit mobile number"
            readOnly={otp.sent}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(-10))}
          />
          {otp.sent && (
            <button type="button" className={styles.inline} onClick={changePhone}>
              Change
            </button>
          )}
        </div>
        {error("phone")}
      </div>

      {otp.sent && (
        <div className={styles.field}>
          <label htmlFor="phone-form-otp">OTP</label>
          <input
            {...input("otp")}
            className={styles.otp}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            autoFocus
            onChange={(e) => set("otp", e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {error("otp") ?? <small>Sent by SMS to +91 {values.phone}.</small>}
          <button
            type="button"
            className={styles.inline}
            disabled={otp.resendIn > 0 || !!busy}
            onClick={() => {
              idToken.current = null;
              sendOtp();
            }}
          >
            {otp.resendIn > 0 ? `Resend OTP in ${otp.resendIn}s` : "Resend OTP"}
          </button>
        </div>
      )}

      {message && (
        <p className={styles.formError} role="alert">
          {message}
          {unregistered && (
            <>
              {" "}
              <Link href={`/register${query}`}>Register now</Link>
            </>
          )}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={!!busy}>
        {busy === "send"
          ? "Sending OTP…"
          : busy === "verify"
            ? "Verifying…"
            : !otp.sent
              ? "Send OTP"
              : register
                ? "Verify & create account"
                : "Verify & sign in"}
      </button>
      {/* Invisible reCAPTCHA required by Firebase phone sign-in */}
      <div ref={otp.recaptchaRef} />

      <p className={styles.switch}>
        {register ? (
          <>
            Already registered? <Link href={`/login${query}`}>Sign in</Link>
          </>
        ) : (
          <>
            New to Mathology? <Link href={`/register${query}`}>Register for the labs</Link>
          </>
        )}
      </p>
      <p className={styles.switch}>
        Teacher? <Link href={`/login/email${query}`}>Sign in with email</Link>
      </p>
    </form>
  );
}
