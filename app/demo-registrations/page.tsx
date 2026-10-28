import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canViewOthers, requireUser } from "@/lib/auth";
import { DEMO_DATES, DEMO_GRADES, DEMO_SLOTS, dateLabel, slotLabel } from "@/lib/demo-class";
import { cleanFilter, listDemoRegistrations, matches, type DemoFilter } from "@/lib/demo-registrations";
import { formatPhone } from "@/lib/student-profile";
import { AccountMenu } from "../account-menu";
import styles from "./registrations.module.css";

export const metadata: Metadata = { title: "Demo class bookings — Mathology" };

type Props = { searchParams: Promise<{ date?: string; slot?: string; grade?: string }> };

const query = (f: DemoFilter) => {
  const params = new URLSearchParams(Object.entries(f).filter((e): e is [string, string] => !!e[1]));
  const s = params.toString();
  return s ? `?${s}` : "";
};

export default async function DemoRegistrationsPage({ searchParams }: Props) {
  const user = await requireUser("/demo-registrations");
  if (!canViewOthers(user.role)) notFound();

  const filter = cleanFilter(await searchParams);
  const all = await listDemoRegistrations();
  const shown = all.filter((r) => matches(r, filter));
  const filtered = !!(filter.date || filter.slot || filter.grade);

  const count = (f: DemoFilter) => all.filter((r) => matches(r, f)).length;
  const registered = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.REPORT_TIMEZONE || "Asia/Kolkata",
  });

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <Link href="/reports" className={styles.back}>
          ← Student reports
        </Link>
        <h1>Demo class bookings</h1>
        <AccountMenu tone="bar" />
      </header>

      <section className={styles.card} aria-labelledby="overview-title">
        <div className={styles.cardHead}>
          <h2 id="overview-title">Bookings per class</h2>
          <p>
            {all.length} total · {DEMO_GRADES.map((g) => `Grade ${g}: ${count({ grade: g })}`).join(" · ")}
          </p>
        </div>
        <div className={styles.scroll}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                {DEMO_SLOTS.map((s) => (
                  <th key={s.id} scope="col">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_DATES.map((d) => (
                <tr key={d}>
                  <th scope="row">
                    <Link href={query({ ...filter, date: d, slot: undefined })}>{dateLabel(d)}</Link>
                  </th>
                  {DEMO_SLOTS.map((s) => {
                    const n = count({ date: d, slot: s.id, grade: filter.grade });
                    const active = filter.date === d && filter.slot === s.id;
                    return (
                      <td key={s.id}>
                        <Link
                          href={query({ ...filter, date: d, slot: s.id })}
                          className={`${styles.count} ${n ? "" : styles.zero} ${active ? styles.active : ""}`}
                          aria-label={`${n} booked for ${dateLabel(d)}, ${s.label}`}
                          aria-current={active ? "true" : undefined}
                        >
                          {n}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="list-title">
        <div className={styles.cardHead}>
          <h2 id="list-title">
            {filter.date ? dateLabel(filter.date) : "All dates"}
            {filter.slot && ` · ${slotLabel(filter.slot)}`}
            {filter.grade && ` · Grade ${filter.grade}`}
          </h2>
          <a href={`/demo-registrations/export${query(filter)}`} className={styles.download} download>
            Download CSV
          </a>
        </div>

        <nav className={styles.filters} aria-label="Filter by grade">
          {[undefined, ...DEMO_GRADES].map((g) => (
            <Link
              key={g ?? "all"}
              href={query({ ...filter, grade: g })}
              className={filter.grade === g ? styles.on : undefined}
              aria-current={filter.grade === g ? "true" : undefined}
            >
              {g ? `Grade ${g}` : "All grades"}
            </Link>
          ))}
          {filtered && (
            <Link href="/demo-registrations" className={styles.clear}>
              Clear filters
            </Link>
          )}
        </nav>

        {shown.length ? (
          <div className={styles.scroll}>
            <table className={styles.list}>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Class</th>
                  <th scope="col">Registered</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{r.school}</small>
                    </td>
                    <td>{r.grade}</td>
                    <td>
                      <a href={`tel:${r.phone}`} className={styles.phone}>
                        {formatPhone(r.phone)}
                      </a>
                      <small className={r.whatsappSent === false ? styles.failed : undefined}>
                        {r.whatsappSent === null ? "WhatsApp pending" : r.whatsappSent ? "WhatsApp sent" : "WhatsApp failed"}
                      </small>
                    </td>
                    <td>
                      {dateLabel(r.date)}
                      <small>{slotLabel(r.slot)}</small>
                    </td>
                    <td>
                      {registered.format(r.createdAt)}
                      {r.updatedAt.getTime() - r.createdAt.getTime() > 1000 && (
                        <small>Changed {registered.format(r.updatedAt)}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>{filtered ? "No bookings match these filters." : "No one has booked a demo class yet."}</p>
        )}
      </section>
    </main>
  );
}
