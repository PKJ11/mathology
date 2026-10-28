import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { PhoneForm } from "../phone-form";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Sign in — Mathology" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link href="/" className={styles.logo}>
          <img src="/logo-color.svg" alt="Mathology by Logicology" />
        </Link>
        <h1>Welcome back</h1>
        <p className={styles.lead}>Sign in with your phone number to continue your labs. Your progress follows you on any device.</p>
        <PhoneForm mode="login" next={next} />
      </section>
    </main>
  );
}
