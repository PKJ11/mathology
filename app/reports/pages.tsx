import { Fragment, type ReactNode } from "react";
import type { ChapterReport, ReportData, SkillStatus } from "@/lib/reports";
import s from "./booklet.module.css";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const ratio = (n: number, d: number) => (d ? n / d : 0);

function minutes(m: number) {
  if (m < 1) return m > 0 ? "<1 min" : "0 min";
  if (m < 60) return `${Math.round(m)} min`;
  return `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
}

function makeDate(tz: string) {
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  const short = new Intl.DateTimeFormat("en-IN", { timeZone: tz, day: "numeric", month: "short" });
  return {
    day: (iso: string | null) => (iso ? day.format(new Date(iso)) : "—"),
    short: (iso: string | null) => (iso ? short.format(new Date(iso)) : "—"),
  };
}

const chunk = <T,>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** Like chunk, but the first page holds fewer because it also carries a summary block. */
const paginate = <T,>(list: T[], first: number, rest: number) =>
  list.length <= first ? [list] : [list.slice(0, first), ...chunk(list.slice(first), rest)];

const clipText = (t: string | null, n: number) => (!t ? "" : t.length > n ? t.slice(0, n).trimEnd() + "…" : t);

// Statuses stay neutral: brand colour never stands for mastery or weakness, the glyph and label carry it
const STATUS: Record<SkillStatus, { label: string; icon: string }> = {
  strong: { label: "Looking strong", icon: "✓" },
  building: { label: "Building", icon: "◐" },
  revisit: { label: "Revisit", icon: "↻" },
  early: { label: "Too early to tell", icon: "○" },
};

const MODE_LABEL: Record<string, string> = {
  practice: "Supported practice",
  challenge: "Challenge",
  check: "Skill check",
  explore: "Exploration",
  "adaptive-practice": "Adaptive practice",
  "adaptive-check": "Adaptive check",
};

// Style guide blue shades 1–5 for the activity calendar; shade 1 is an inactive day
const HEAT = ["#edf6fc", "#b8ddf3", "#72b9e3", "#357faf", "#164b70"];

const FOOTER = "Mathology · Class 10";

// ---------------------------------------------------------------------------
// Page shells
// ---------------------------------------------------------------------------

type Spec = { section?: string; render: (folio: number) => ReactNode };
type Tone = "blue" | "yellow" | "pink";

/** The three-colour rule along the top edge of every page. */
const Rule = () => (
  <div className={s.rule} aria-hidden="true">
    <i />
    <i />
    <i />
  </div>
);

function Paper({ folio, className, children }: { folio: number; className?: string; children: ReactNode }) {
  return (
    <div data-page="" data-density="soft" id={`page-${folio}`} className={`${s.page} ${className ?? ""}`}>
      <Rule />
      <div className={s.inner}>{children}</div>
      <footer className={s.footer}>
        <span>{FOOTER}</span>
        <span>{String(folio).padStart(2, "0")}</span>
      </footer>
    </div>
  );
}

function Heading({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <header className={s.heading}>
      {kicker && <span className={s.kicker}>{kicker}</span>}
      <h2>{title}</h2>
    </header>
  );
}

function Stat({ value, label, note, tone }: { value: string; label: string; note?: string; tone: Tone }) {
  return (
    <div className={`${s.stat} ${s[tone]}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </div>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span className={s.meter} data-tip={label}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

/** Sky blue cover shared by the front and back of the booklet. */
function Cover({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div data-page="" data-density="hard" className={`${s.page} ${s.cover}`}>
      <Rule />
      <div className={s.coverLogo}>
        <img src="/logo-color.svg" alt={label ?? ""} />
      </div>
      <div className={s.motif} aria-hidden="true">
        <i />
        <i />
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The booklet
// ---------------------------------------------------------------------------

export function bookletPages(r: ReportData): ReactNode[] {
  const d = makeDate(r.timezone);
  const t = r.totals;
  const active = r.chapters.filter((c) => c.attempts || c.activeMinutes || c.runsStarted || c.lessonsCompleted);
  const hasData = t.events > 0;
  const specs: Spec[] = [];

  // About
  specs.push({
    render: (n) => (
      <Paper folio={n}>
        <Heading kicker="Before you begin" title="How to read this booklet" />
        <div className={s.prose}>
          <p>
            This booklet is built from everything {r.student.name.split(" ")[0]} did in the Mathology Class 10 labs:
            lessons opened, labs explored, answers given, help used and reasoning written.
          </p>
          <ul>
            <li>
              <b>On your own</b> answers had no hint, worked explanation or repeated question. They are the fairest
              picture of what you can do.
            </li>
            <li>
              <b>Supported answers</b> came after help or practice mode. They show learning in progress, not a weakness.
            </li>
            <li>
              <b>Too early to tell</b> means there isn&apos;t enough evidence yet. An unattempted skill is not a weak
              skill.
            </li>
            <li>Marking a lesson complete is your own report of finishing it, not a test result.</li>
            <li>
              <b>Active time</b> counts only while the chapter was on screen and in use; breaks are left out.
            </li>
          </ul>
          <p className={s.muted}>
            Answers are checked in the browser by each chapter&apos;s rules. Times are shown in {r.timezone.replace("_", " ")} time.
          </p>
        </div>
      </Paper>
    ),
  });

  if (!hasData) {
    specs.push({
      section: "Getting started",
      render: (n) => (
        <Paper folio={n}>
          <Heading kicker="Nothing recorded yet" title="Your story starts here" />
          <div className={s.prose}>
            <p>
              Open any chapter from the Class 10 labs and work through a lesson, a lab or a challenge. Every step you take
              is saved to your account, and this booklet fills itself in.
            </p>
            <p className={s.muted}>Come back after a session to see your first pages.</p>
          </div>
        </Paper>
      ),
    });
  } else {
    // At a glance
    specs.push({
      section: "At a glance",
      render: (n) => (
        <Paper folio={n}>
          <Heading kicker="Summary" title="At a glance" />
          <div className={s.stats}>
            <Stat tone="blue" value={minutes(t.activeMinutes)} label="active learning" note={plural(t.sessions, "visit")} />
            <Stat tone="blue" value={String(t.attempts)} label="questions answered" note={`${pct(t.correct, t.attempts)} correct`} />
            <Stat
              tone="yellow"
              value={pct(t.independentCorrect, t.independentAttempts)}
              label="correct on your own"
              note={`${plural(t.independentAttempts, "answer")} without help`}
            />
            <Stat
              tone="yellow"
              value={`${t.chaptersStarted} / 14`}
              label="chapters started"
              note={`${plural(t.lessonsCompleted, "lesson")} marked done`}
            />
            <Stat tone="pink" value={`${t.runsCompleted} / ${t.runsStarted}`} label="challenges finished" />
            <Stat
              tone="pink"
              value={t.avgSeconds != null ? `${Math.round(t.avgSeconds)} s` : "—"}
              label="per question"
              note="average active time"
            />
          </div>
          <p className={s.footnote}>
            {plural(t.supportUses, "time")} you asked for a hint or explanation · {plural(t.drafts, "piece")} of written reasoning ·{" "}
            {t.events.toLocaleString("en-IN")} recorded actions
          </p>
        </Paper>
      ),
    });

    // Chapters overview (single-series bar: accuracy per chapter)
    specs.push({
      section: "Chapters overview",
      render: (n) => (
        <Paper folio={n}>
          <Heading kicker="All 14 chapters" title="Where you've been" />
          <p className={s.caption}>Share of answers correct in each chapter, with the number of answers.</p>
          <ol className={s.bars}>
            {r.chapters.map((c) => (
              <li key={c.number}>
                <b className={s.barNo}>{c.number}</b>
                <span className={s.barLabel}>{c.title}</span>
                {c.attempts ? (
                  <span
                    className={s.barValue}
                    data-tip={`${c.title}: ${c.correct} of ${c.attempts} correct, ${c.independentAttempts} on your own`}
                  >
                    {pct(c.correct, c.attempts)} · {c.attempts}
                    <Meter value={ratio(c.correct, c.attempts)} label={`${c.correct} of ${c.attempts} correct`} />
                  </span>
                ) : (
                  <span className={s.barEmpty}>{c.activeMinutes ? "Explored, no answers yet" : "Not started"}</span>
                )}
              </li>
            ))}
          </ol>
        </Paper>
      ),
    });

    // Activity calendar
    const maxDay = Math.max(1, ...r.daily.map((x) => x.attempts));
    const activeDays = r.daily.filter((x) => x.attempts || x.activeMinutes).length;
    let streak = 0;
    let best = 0;
    for (const x of r.daily) {
      streak = x.attempts || x.activeMinutes ? streak + 1 : 0;
      best = Math.max(best, streak);
    }
    // 0 → inactive (shade 1); answered days spread over shades 2–5, the busiest day darkest
    const level = (v: number) => (v === 0 ? 0 : 1 + Math.min(3, Math.floor((v / maxDay) * 3.999)));
    specs.push({
      section: "Activity",
      render: (n) => (
        <Paper folio={n}>
          <Heading kicker="Last 5 weeks" title="When you learned" />
          <p className={s.caption}>Each square is a day, darker means more questions answered.</p>
          <div className={s.calendar} role="table" aria-label="Questions answered per day">
            {r.daily.map((x) => {
              const l = level(x.attempts);
              return (
                <span
                  key={x.date}
                  role="cell"
                  className={`${s.day} ${l ? "" : s.dayEmpty}`}
                  style={{ background: HEAT[l] }}
                  data-tip={`${d.day(x.date + "T12:00:00Z")}: ${x.attempts} questions, ${minutes(x.activeMinutes)}`}
                />
              );
            })}
          </div>
          <div className={s.legend}>
            <span>Fewer</span>
            {HEAT.map((c, i) => (
              <i key={c} className={i ? "" : s.dayEmpty} style={{ background: c }} />
            ))}
            <span>More</span>
          </div>
          <div className={s.stats}>
            <Stat tone="blue" value={String(activeDays)} label={activeDays === 1 ? "active day" : "active days"} note="in the last 35" />
            <Stat tone="yellow" value={plural(best, "day")} label="longest streak" />
          </div>
          <p className={s.footnote}>
            First visit {d.day(r.period.from)} · latest {d.day(r.period.to)}
          </p>
        </Paper>
      ),
    });

    // How you practised
    specs.push({
      section: "How you practised",
      render: (n) => (
        <Paper folio={n}>
          <Heading kicker="Ways of working" title="How you practised" />
          <table className={s.table}>
            <thead>
              <tr>
                <th>Mode</th>
                <th>Answers</th>
                <th>Correct</th>
              </tr>
            </thead>
            <tbody>
              {r.modes.map((m) => (
                <tr key={m.mode}>
                  <td>{MODE_LABEL[m.mode] ?? m.mode}</td>
                  <td>{m.attempts}</td>
                  <td>
                    <span className={s.cellBar}>
                      {pct(m.correct, m.attempts)}
                      <Meter value={ratio(m.correct, m.attempts)} label={`${m.correct} of ${m.attempts} correct`} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={s.stats}>
            <Stat tone="yellow" value={String(t.supportUses)} label="hints & explanations" />
            <Stat
              tone="yellow"
              value={String(t.rejectedSubmissions)}
              label={t.rejectedSubmissions === 1 ? "answer sent back" : "answers sent back"}
              note="empty or not readable"
            />
          </div>
          <p className={s.footnote}>Asking for help is part of learning. Supported answers are kept apart from your own.</p>
        </Paper>
      ),
    });

    // One or more pages per active chapter; the first page also carries the chapter's statistics
    for (const c of active) {
      const groups = c.skills.length ? paginate(c.skills, 7, 9) : [[]];
      groups.forEach((skills, i) =>
        specs.push({
          section: i === 0 ? `Chapter ${c.number} · ${c.title}` : undefined,
          render: (n) => <ChapterPage folio={n} c={c} skills={skills} first={i === 0} part={i + 1} parts={groups.length} />,
        }),
      );
    }

    // Answers to review
    if (r.mistakes.length) {
      chunk(r.mistakes, 4).forEach((list, i) =>
        specs.push({
          section: i === 0 ? "Answers to review" : undefined,
          render: (n) => (
            <Paper folio={n}>
              <Heading kicker="Learn from these" title={i === 0 ? "Answers to review" : "More to review"} />
              <ul className={s.cards}>
                {list.map((m, j) => (
                  <li key={j}>
                    <span className={s.cardMeta}>
                      Chapter {m.chapter} · {clipText(m.skill, 60)} · {d.short(m.at)}
                    </span>
                    {m.prompt && <p className={s.cardTitle}>{clipText(m.prompt, 160)}</p>}
                    <p>
                      <span className={s.mark}>You:</span> {clipText(m.response, 80) || "—"}
                    </p>
                    <p>
                      <span className={s.mark}>Answer:</span> {clipText(m.answer, 80) || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </Paper>
          ),
        }),
      );
    }

    // Written reasoning
    if (r.drafts.length) {
      chunk(r.drafts, 2).forEach((list, i) =>
        specs.push({
          section: i === 0 ? "Written reasoning" : undefined,
          render: (n) => (
            <Paper folio={n}>
              <Heading kicker="In your own words" title="Written reasoning" />
              <ul className={s.cards}>
                {list.map((w, j) => (
                  <li key={j}>
                    <span className={s.cardMeta}>
                      Chapter {w.chapter} · {clipText(w.title, 50)} · {d.short(w.savedAt)}
                      {w.versions > 1 ? ` · ${plural(w.versions, "version")}` : ""}
                    </span>
                    <blockquote className={s.quote}>{clipText(w.text, 520) || <i>Empty draft</i>}</blockquote>
                  </li>
                ))}
              </ul>
              <p className={s.footnote}>Saved for your teacher to read. Not marked automatically.</p>
            </Paper>
          ),
        }),
      );
    }

    // Adaptive next steps; reflowed onto further pages rather than cut at the page edge
    if (r.adaptive.decisions || r.adaptive.interventions || r.adaptive.remediations) {
      paginate(r.adaptive.recent, 5, 7).forEach((list, i) =>
        specs.push({
          section: i === 0 ? "Adaptive next steps" : undefined,
          render: (n) => (
            <Paper folio={n}>
              <Heading kicker="Suggested by the labs" title={i === 0 ? "Adaptive next steps" : "More next steps"} />
              {i === 0 && (
                <div className={s.stats}>
                  <Stat tone="blue" value={String(r.adaptive.decisions)} label="recommendations" />
                  <Stat tone="yellow" value={String(r.adaptive.interventions)} label="focused lessons" note="opened" />
                </div>
              )}
              <ul className={s.cards}>
                {list.map((a, j) => (
                  <li key={j}>
                    <span className={s.cardMeta}>
                      Chapter {a.chapter} · {d.short(a.at)}
                    </span>
                    <p className={s.cardTitle}>{clipText(a.skill, 90)}</p>
                    {a.reason && <p>{clipText(a.reason, 200)}</p>}
                  </li>
                ))}
              </ul>
            </Paper>
          ),
        }),
      );
    }
  }

  // Contents goes after "How to read"; pad so the back cover closes the book
  const contentsAt = 1;
  const innerCount = specs.length + 1; // + contents page
  const needsPad = innerCount % 2 === 1;
  if (needsPad)
    specs.push({
      render: (n) => (
        <Paper folio={n} className={s.notes}>
          <Heading kicker="Your page" title="Notes" />
          <div className={s.lines}>
            {Array.from({ length: 19 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        </Paper>
      ),
    });

  // Folios: cover is 1, so inner pages start at 2
  const entries: { title: string; folio: number }[] = [];
  specs.forEach((spec, i) => {
    const folio = i + 2 + (i >= contentsAt ? 1 : 0);
    if (spec.section) entries.push({ title: spec.section, folio });
  });

  const contents: Spec = {
    render: (n) => (
      <Paper folio={n}>
        <Heading kicker="Inside" title="Contents" />
        <ol className={s.toc}>
          {entries.map((e) => (
            <li key={e.title}>
              {/* data-goto lets the on-screen booklet turn to the page; the href links pages in the PDF */}
              <a href={`#page-${e.folio}`} data-goto={e.folio}>
                <span>{e.title}</span>
                <b>{e.folio}</b>
              </a>
            </li>
          ))}
        </ol>
      </Paper>
    ),
  };
  specs.splice(contentsAt, 0, contents);

  const student = r.student;
  const meta = [`Class ${student.grade}`, student.className, student.school].filter(Boolean).join(" · ");

  return [
    <Cover key="cover" label="Mathology by Logicology">
      <div className={s.coverText}>
        <span className={s.coverKicker}>Learning report</span>
        <h1>{student.name}</h1>
        <p className={s.coverMeta}>{meta}</p>
      </div>
      <p className={s.coverDate}>{r.period.from ? `${d.day(r.period.from)} – ${d.day(r.period.to)}` : "No activity yet"}</p>
    </Cover>,
    ...specs.map((spec, i) => <Fragment key={i}>{spec.render(i + 2)}</Fragment>),
    <Cover key="back">
      <div className={s.coverText}>
        <p className={s.tagline}>
          Learn.
          <br />
          Challenge.
          <br />
          Reflect.
        </p>
      </div>
      <p className={s.coverDate}>Generated {d.day(r.generatedAt)}</p>
    </Cover>,
  ];
}

function ChapterPage({
  folio,
  c,
  skills,
  first,
  part,
  parts,
}: {
  folio: number;
  c: ChapterReport;
  skills: ChapterReport["skills"];
  first: boolean;
  part: number;
  parts: number;
}) {
  return (
    <Paper folio={folio}>
      <header className={s.chapterBand}>
        <span className={s.chapterNo}>{c.number}</span>
        <div>
          <span className={s.kicker}>
            Chapter {c.number}
            {parts > 1 ? ` · part ${part} of ${parts}` : ""}
          </span>
          <h2>{c.title}</h2>
        </div>
      </header>
      {first && (
        <div className={s.miniStats}>
          <span>
            <b>{pct(c.correct, c.attempts)}</b> correct
          </span>
          <span>
            <b>{pct(c.independentCorrect, c.independentAttempts)}</b> on your own
          </span>
          <span>
            <b>{minutes(c.activeMinutes)}</b> active
          </span>
          <span>
            <b>
              {c.skillsPracticed}/{c.skillsTotal}
            </b>{" "}
            skills tried
          </span>
          <span>
            <b>
              {c.runsCompleted}/{c.runsStarted}
            </b>{" "}
            challenges done
          </span>
          <span>
            <b>{c.lessonsCompleted}</b> lessons marked done
          </span>
        </div>
      )}
      {skills.length ? (
        <ul className={s.skills}>
          {skills.map((k) => {
            const st = STATUS[k.status];
            return (
              <li key={k.id}>
                <div className={s.skillMain}>
                  <span className={s.skillTitle}>{clipText(k.title, 90)}</span>
                  <Meter value={ratio(k.correct, k.attempts)} label={`${k.correct} of ${k.attempts} correct`} />
                  <span className={s.skillFacts}>
                    {k.correct}/{k.attempts} correct · {k.independentCorrect}/{k.independentAttempts} on your own
                  </span>
                </div>
                <span className={s.chip}>
                  <i aria-hidden="true">{st.icon}</i>
                  {st.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={s.muted}>You explored this chapter but haven&apos;t answered questions yet.</p>
      )}
    </Paper>
  );
}
