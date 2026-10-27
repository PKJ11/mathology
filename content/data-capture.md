# Mathology data capture

How the interactions listed in `Mathology_Interaction_Data.xlsx` are now captured in MongoDB.

## Flow

1. A learner signs in (`/register`, `/login`). Sessions are random tokens in an httpOnly cookie; only their SHA-256 hash is stored (`auth_sessions`, expired by TTL index).
2. `/chapters/chapter-N` embeds `/lab/chapter-N`, which serves the chapter HTML from `content/` with two scripts injected ahead of the chapter code:
   - `window.__MTH__`: the learner ID, the chapter's store keys and the learner's last synced chapter state.
   - `public/mathology-tracker.js`: the tracker.
3. The tracker:
   - **Namespaces** chapter `localStorage` keys per learner (`mth:u:<userId>:…`), so people sharing a device never see each other's progress. Old pre-login browser data is left untouched and ignored.
   - **Restores** the server copy of each chapter store, so progress follows the learner across devices.
   - **Diffs** every chapter save into events, and adds the page-level events the chapters never recorded.
   - **Queues** events in a per-visit outbox in `localStorage` and sends them in batches to `POST /api/track/events`, using `sendBeacon` on exit. Every event has a stable `eventId` (unique per user), so retries never duplicate.
   - **Sends** the latest raw chapter stores to `POST /api/track/state`.
4. The server appends events to `events` (the full action log) and maintains read-optimised projections. Projection counters run only for newly inserted events.

Chapter code is unchanged. Grading still happens in the browser (`gradedBy: "client"`), but each attempt stores the response, expected answer, prompt and content/release versions, so a server-side grader can be added later without changing the schema.

## Collections

| Collection | One document per | Key fields |
|---|---|---|
| `users` | learner / teacher | email (unique), name, role, school, className, grade |
| `events` | interaction (append-only) | userId, eventId, type, sessionId, tabId, seq, chapter, chapterId, route, clientAt, receivedAt, contentVersion, releaseVersion, source, payload |
| `attempts` | submitted answer (Ch 1 and Ch 2–14 normalised) | skillId, questionId, family, fingerprint, format, prompt, response, expected, correct, mode, practice, adaptive, supported, repeated, independent, hintUsed, hintCount, answerChanged, pendingChanges, errorCategory, activeSeconds, timingValid, openedAt, firstInteractionAt, submittedAt |
| `runs` | practice / challenge / readiness / adaptive run | runId, group, practice, adaptive, items, startedAt, answered, correct, helpCount, lastAnswerAt, complete, completedAt |
| `learning_sessions` | page visit | sessionId, chapter, startedAt, lastSeenAt, endedAt, activeMs, eventCount, userAgent |
| `drafts` | **every** saved version of written reasoning | chapter, group, text, savedAt, reviewStatus, teacherReview (reserved) |
| `chapter_state` | learner × chapter store | key, raw, savedAt (latest snapshot, for resume) |
| `auth_sessions` | sign-in | hashed token, userId, expiresAt |

The curriculum catalogue (skill and lesson titles) is extracted from the chapter HTML into `lib/catalogue.json` (`npm run catalogue`) and joined at report time.

## Spreadsheet rows → events

| Rows | Captured as |
|---|---|
| I01 | `users` + authenticated `userId` on every record |
| I02, I03 | `PAGE_OPENED`, `ROUTE_VIEWED` (route, from, dwellMs) |
| I04–I10, I12, I13, I16, I18, I20, I22, I24, I25, I28, I29, I32, I35, I36, I40, I48 | Chapter 1's own log entries, forwarded with their original payloads (`source: "chapter-log"`) |
| I11 | `LAB_STATE_CHANGED` (value and previous value, debounced) plus `INPUT_CHANGED` for each control |
| I14 | `INPUT_CHANGED` with `unsavedText: true` (unsaved writing) |
| I15 | `DRAFT_SAVED`, with every version kept in `drafts` |
| I17 | `DETAILS_TOGGLED` (every `<details>` open/close) |
| I19 | `LEARN_COMPLETED` |
| I21, I41, I42, I43 | `RUN_STARTED`, `RUN_COMPLETED` (with completedAt and durationMs), `QUESTION_VIEWED` with `resumed`, `runs` |
| I23, I47 | `QUESTION_VIEWED` plus per-question active time on each attempt (`activeSeconds`, `openedAt`, `firstInteractionAt`) |
| I26, I27, I39 | `ANSWER_PENDING_CHANGED` (debounced, with change count), `PLOT_DRAWN`, `answerChanged`/`pendingChanges` on the attempt |
| I30, I31 | `HELP_USED` (via which control), `hintCount` on the attempt, `runs.helpCount` |
| I33, I34 | `SUBMIT_REJECTED` (with the validation message) |
| I37, I38 | `ANSWER_SUBMITTED` → `attempts`; `QUESTION_ADVANCED` |
| I44 | `EXPOSURE_RECORDED` (with timestamps) |
| I46 | `PAGE_HIDDEN`/`PAGE_VISIBLE`, `IDLE_STARTED`/`IDLE_ENDED`, `learning_sessions.activeMs` |
| I49, I50, I52 | `ADAPTIVE_INTERVENTION`, `ADAPTIVE_DECISION` |
| I51 | `SCOPE_CHANGED` |
| I54 | Simulated teacher-lab events are **dropped** (never stored as learner evidence) |
| I55 | `EXPORT_REQUESTED` |
| I56 | `PAGE_EXIT` (activeMs, durationMs, the question still open) |
| I57 | `STORAGE_ERROR` (quota failures and the chapter's "saving paused" status), `CLIENT_ERROR` |
| all | `UI_CLICK` for every button, link, summary and label |

Known limits: active time measures browser focus and input, not attention. A click on a disabled button (Chapter 1's empty submit) can't be observed. Grading is client-side.

## Reports

`/reports` builds a page-turning booklet (StPageFlip, the engine behind `react-pageflip`) from `attempts`, `runs`, `learning_sessions`, `drafts` and `events`. Its sections are: summary, chapter overview, 5-week activity calendar, practice modes, one or more pages per active chapter with per-skill status, answers to review, written reasoning, and adaptive next steps. **Print / PDF** prints the pages as A5.

Emails listed in `MATHOLOGY_TEACHER_EMAILS` register as teachers. Teachers see a student roster at `/reports` and open any booklet with `/reports?student=<id>`.
