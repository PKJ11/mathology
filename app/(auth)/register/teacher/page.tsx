import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { AuthForm } from "../../auth-form";
import styles from "../../auth.module.css";

export const metadata: Metadata = { title: "Teacher account — Mathology" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function TeacherRegisterPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link href="/" className={styles.logo}>
          <img src="/logo-color.svg" alt="Mathology by Logicology" />
        </Link>
        <h1>Create a teacher account</h1>
        <p className={styles.lead}>
          Use the email your school gave to Mathology. Teachers can open every student&rsquo;s learning report and the
          demo class bookings.
        </p>
        <AuthForm mode="register" next={next} />
      </section>
    </main>
  );
}
