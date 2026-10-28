"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, registerTeacher, type AuthFormState } from "../actions/auth";
import styles from "./auth.module.css";

type Props = { mode: "login" | "register"; next?: string };

/** Email + password: teachers, and accounts made before students switched to phone sign-up. */
export function AuthForm({ mode, next }: Props) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    mode === "login" ? login : registerTeacher,
    undefined,
  );
  const v = state?.values ?? {};
  const e = state?.errors ?? {};
  const query = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <form action={action} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next ?? ""} />

      {mode === "register" && (
        <Field label="Full name" name="name" autoComplete="name" defaultValue={v.name} error={e.name} />
      )}
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={v.email} error={e.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        error={e.password}
        hint={mode === "register" ? "At least 8 characters, with a letter and a number." : undefined}
      />

      {state?.message && (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create teacher account"}
      </button>

      <p className={styles.switch}>
        {mode === "login" ? (
          <>
            New teacher? <Link href={`/register/teacher${query}`}>Create a teacher account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href={`/login/email${query}`}>Sign in</Link>
          </>
        )}
      </p>
      <p className={styles.switch}>
        Student? <Link href={`/login${query}`}>Sign in with your phone number</Link>
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
}) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <small id={`${name}-error`} className={styles.fieldError}>
          {error}
        </small>
      ) : hint ? (
        <small id={`${name}-hint`}>{hint}</small>
      ) : null}
    </label>
  );
}
