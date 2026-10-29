import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canViewOthers, requireUser, toObjectId } from "@/lib/auth";
import { formatPhone } from "@/lib/student-profile";
import { buildReport, listStudents } from "@/lib/reports";
import { AccountMenu } from "../account-menu";
import { Booklet } from "./booklet";
import { bookletPages } from "./pages";
import styles from "./booklet.module.css";

export const metadata: Metadata = { title: "Learning report — Mathology" };

type Props = { searchParams: Promise<{ student?: string }> };

export default async function ReportsPage({ searchParams }: Props) {
  const user = await requireUser("/reports");
  const { student } = await searchParams;
  const teacher = canViewOthers(user.role);

  if (teacher && !student) return <StudentList />;

  const targetId = toObjectId(teacher && student ? student : user.id);
  if (!targetId) notFound();
  const report = await buildReport(targetId);
  if (!report) notFound();

  return (
    <main className={styles.desk}>
      {/* Print the booklet as full-bleed A4; zero margins also drop the browser's date, URL and page numbers */}
      <style>{"@page { size: A4; margin: 0; }"}</style>
      <header className={styles.top}>
        <Link href={teacher ? "/reports" : "/chapters"} className={styles.back}>
          ← {teacher ? "All students" : "Chapters"}
        </Link>
        <h1>{teacher && student ? `${report.student.name}'s learning report` : "My learning report"}</h1>
        <AccountMenu tone="bar" />
      </header>
      <Booklet title={`Learning report for ${report.student.name}`}>{bookletPages(report)}</Booklet>
    </main>
  );
}

async function StudentList() {
  const students = await listStudents();
  const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return (
    <main className={styles.desk}>
      <header className={styles.top}>
        <Link href="/chapters" className={styles.back}>
          ← Chapters
        </Link>
        <h1>Student reports</h1>
        <AccountMenu tone="bar" />
      </header>
      <section className={styles.roster}>
        {students.length ? (
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>School</th>
                <th>City</th>
                <th>Class</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr key={st.id}>
                  <td>
                    <Link href={`/reports?student=${st.id}`}>{st.name}</Link>
                    {st.contact && <small>{formatPhone(st.contact)}</small>}
                  </td>
                  <td>{st.school ?? "—"}</td>
                  <td>{st.city ?? "—"}</td>
                  <td>{st.className ?? "—"}</td>
                  <td>{st.lastActive ? fmt.format(new Date(st.lastActive)) : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No students have registered yet.</p>
        )}
      </section>
    </main>
  );
}
