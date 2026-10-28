import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { AuthForm } from "../../auth-form";
import styles from "../../auth.module.css";

export const metadata: Metadata = { title: "Sign in with email — Mathology" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function EmailLoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link href="/" className={styles.logo}>
          <img src="/logo-color.svg" alt="Mathology by Logicology" />
        </Link>
        <h1>Sign in with email</h1>
        <p className={styles.lead}>For teachers, and accounts created with an email address.</p>
        <AuthForm mode="login" next={next} />
      </section>
    </main>
  );
}
