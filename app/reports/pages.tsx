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

const clipText = (t: string | null, n: number) => (!t ? "" : t.length > n ? t.slice(0, n).trimEnd() + "…" : t);

const STATUS: Record<SkillStatus, { label: string; icon: string; className: string }> = {
  strong: { label: "Looking strong", icon: "✓", className: s.good },
  building: { label: "Building", icon: "◐", className: s.warning },
  revisit: { label: "Revisit", icon: "↻", className: s.serious },
  early: { label: "Too early to tell", icon: "○", className: s.neutral },
};

const MODE_LABEL: Record<string, string> = {
  practice: "Supported practice",
  challenge: "Challenge",
  check: "Skill check",
  explore: "Exploration",
  "adaptive-practice": "Adaptive practice",
  "adaptive-check": "Adaptive check",
};

// Sequential blue (light → dark) for the activity calendar
const HEAT = ["#eef2f7", "#cde2fb", "#9ec5f4", "#5598e7", "#2a78d6", "#184f95"];

// ---------------------------------------------------------------------------
// Page shells
// ---------------------------------------------------------------------------

type Spec = { section?: string; hard?: boolean; render: (folio: number) => ReactNode };

function Paper({ folio, hard, className, children }: { folio: number; hard?: boolean; className?: string; children: ReactNode }) {
  return (
    <div data-page="" data-density={hard ? "hard" : "soft"} className={`${s.page} ${hard ? s.hard : ""} ${className ?? ""}`}>
      <div className={s.inner}>{children}</div>
      {!hard && <div className={`${s.folio} ${folio % 2 ? s.folioRight : s.folioLeft}`}>{folio}</div>}
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

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className={s.stat}>
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
              <b>Supported</b> answers came after help or practice mode. They show learning in progress, not a weakness.
            </li>
            <li>
              <b>Too early to tell</b> means there isn&apos;t enough evidence yet. An unattempted skill is not a weak
              skill.
            </li>
            <li>Marking a lesson complete is your own report of finishing it, not a test result.</li>
            <li>Active time counts only while the chapter was on screen and in use; breaks are left out.</li>
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
            <Stat value={minutes(t.activeMinutes)} label="active learning" note={plural(t.sessions, "visit")} />
            <Stat value={String(t.attempts)} label="questions answered" note={`${pct(t.correct, t.attempts)} correct`} />
            <Stat
              value={pct(t.independentCorrect, t.independentAttempts)}
              label="correct on your own"
              note={`${plural(t.independentAttempts, "answer")} without help`}
            />
            <Stat value={`${t.chaptersStarted} / 14`} label="chapters started" note={`${plural(t.lessonsCompleted, "lesson")} marked done`} />
            <Stat value={`${t.runsCompleted} / ${t.runsStarted}`} label="challenges finished" />
            <Stat
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
                <span className={s.barLabel}>
                  <b>{c.number}</b> {c.title}
                </span>
                {c.attempts ? (
                  <span
                    className={s.barTrack}
                    data-tip={`${c.title}: ${c.correct} of ${c.attempts} correct, ${c.independentAttempts} on your own`}
                  >
                    <span className={s.barFill} style={{ width: `${ratio(c.correct, c.attempts) * 100}%` }} />
                    <span className={s.barValue}>
                      {pct(c.correct, c.attempts)} <small>· {c.attempts}</small>
                    </span>
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
    const level = (v: number) => (v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / maxDay) * 4.999)));
    specs.push({
      section: "Activity",
      render: (n) => (
        <Paper folio={n}>
          <Heading kicker="Last 5 weeks" title="When you learned" />
          <p className={s.caption}>Each square is a day, darker means more questions answered.</p>
          <div className={s.calendar} role="table" aria-label="Questions answered per day">
            {r.daily.map((x) => (
              <span
                key={x.date}
                role="cell"
                className={s.day}
                style={{ background: HEAT[level(x.attempts)] }}
                data-tip={`${d.day(x.date + "T12:00:00Z")}: ${x.attempts} questions, ${minutes(x.activeMinutes)}`}
              />
            ))}
          </div>
          <div className={s.legend}>
            <span>Fewer</span>
            {HEAT.map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
            <span>More</span>
          </div>
          <div className={s.stats}>
            <Stat value={String(activeDays)} label={activeDays === 1 ? "active day" : "active days"} note="in the last 35" />
            <Stat value={plural(best, "day")} label="longest streak" />
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
                      <Meter value={ratio(m.correct, m.attempts)} label={`${m.correct} of ${m.attempts} correct`} />
                      {pct(m.correct, m.attempts)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={s.stats}>
            <Stat value={String(t.supportUses)} label="hints & explanations" />
            <Stat value={String(t.rejectedSubmissions)} label={t.rejectedSubmissions === 1 ? "answer sent back" : "answers sent back"} note="empty or not readable" />
          </div>
          <p className={s.footnote}>Asking for help is part of learning. Supported answers are kept apart from your own.</p>
        </Paper>
      ),
    });

    // One or more pages per active chapter
    for (const c of active) {
      const groups = c.skills.length ? chunk(c.skills, 7) : [[]];
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
                    {m.prompt && <p className={s.cardPrompt}>{clipText(m.prompt, 160)}</p>}
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

    // Adaptive next steps
    if (r.adaptive.decisions || r.adaptive.interventions || r.adaptive.remediations) {
      specs.push({
        section: "Adaptive next steps",
        render: (n) => (
          <Paper folio={n}>
            <Heading kicker="Suggested by the labs" title="Adaptive next steps" />
            <div className={s.stats}>
              <Stat value={String(r.adaptive.decisions)} label="recommendations" />
              <Stat value={String(r.adaptive.interventions)} label="focused lessons opened" />
            </div>
            <ul className={s.cards}>
              {r.adaptive.recent.map((a, j) => (
                <li key={j}>
                  <span className={s.cardMeta}>
                    Chapter {a.chapter} · {d.short(a.at)}
                  </span>
                  <p>
                    <b>{clipText(a.skill, 70)}</b>
                  </p>
                  {a.reason && <p className={s.muted}>{clipText(a.reason, 140)}</p>}
                </li>
              ))}
            </ul>
          </Paper>
        ),
      });
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
          <div className={s.lines} />
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
              <span>{e.title}</span>
              <i />
              <b>{e.folio}</b>
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
    <div key="cover" data-page="" data-density="hard" className={`${s.page} ${s.hard} ${s.cover}`}>
      <div className={s.coverInner}>
        <img src="/logo-white.svg" alt="Mathology by Logicology" className={s.coverLogo} />
        <span className={s.coverKicker}>Learning report</span>
        <h1>{student.name}</h1>
        <p>{meta}</p>
        <p className={s.coverPeriod}>
          {r.period.from ? `${d.day(r.period.from)} – ${d.day(r.period.to)}` : "No activity yet"}
        </p>
      </div>
    </div>,
    ...specs.map((spec, i) => <Fragment key={i}>{spec.render(i + 2)}</Fragment>),
    <div key="back" data-page="" data-density="hard" className={`${s.page} ${s.hard} ${s.backCover}`}>
      <div className={s.coverInner}>
        <img src="/logo-white.svg" alt="" className={s.backLogo} />
        <p>Learn. Challenge. Reflect.</p>
        <p className={s.coverPeriod}>Generated {d.day(r.generatedAt)}</p>
      </div>
    </div>,
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
          <span className={s.kicker}>Chapter {c.number}{parts > 1 ? ` · part ${part} of ${parts}` : ""}</span>
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
                <div className={s.skillHead}>
                  <span className={s.skillTitle}>{clipText(k.title, 90)}</span>
                  <span className={`${s.chip} ${st.className}`}>
                    <i aria-hidden="true">{st.icon}</i>
                    {st.label}
                  </span>
                </div>
                <div className={s.skillFacts}>
                  <Meter value={ratio(k.correct, k.attempts)} label={`${k.correct} of ${k.attempts} correct`} />
                  <span>
                    {k.correct}/{k.attempts} correct · {k.independentCorrect}/{k.independentAttempts} on your own
                  </span>
                </div>
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
