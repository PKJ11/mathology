# Mathology practice and test data audit

Reviewed 26 October 2026. Scope: the local `mathology-release` package under `2026-10-12/ta/outputs`, particularly `site/class-10`, the shared adaptive scripts, and the offline Chapter 2 submission code. This is a source-code audit, not an inspection of a deployed site or real learner records. The active release identifies itself as `2026-10-13.adaptive1`. No website code was changed.

## Main finding

The files save question-attempt evidence linked to micro-skills. They do not send that evidence to an authenticated central analytics service. Browser-local history can support descriptive reports, but registration needs to be accompanied by account-linked persistence and a consistent event schema.

Reporting hierarchy: Class 10 → chapter → lesson/lab group → micro-skill → question form → submitted response. A run groups questions into a practice or challenge attempt. Student identity is the missing outer dimension.

## Chapters 2–14: saved response dictionary

The same submission field set appears in all thirteen chapter storage scripts.

| Field | Meaning |
|---|---|
| chapterId | Chapter identifier |
| contentVersion, releaseVersion | Content and application release associated with response |
| runId | Practice/challenge run containing the response |
| skillId | Micro-skill tested |
| questionId | Question form identifier, including variant suffix |
| family | Authored question-family identifier; not a calibrated difficulty score |
| fingerprint | Repeat-detection key; implementation is chapter-specific, not proof of psychometric equivalence |
| format | Response format such as choice, numbers, construction, point or plot |
| prompt | Question wording snapshot |
| response | Submitted values in an array |
| responseText | Selected option text or readable submitted values |
| correct | Overall Boolean grading result |
| expected | Expected answer values |
| answer, explanation | Readable correct answer and explanation |
| supported | Practice/help/prior exposure caused the response to be treated as supported |
| repeated | A matching form had been answered previously |
| independent | Neither supported nor repeated under current client rules |
| submittedAt | Browser-generated submission date/time |

No separate correctness or partial-credit mark is persisted for each element of a multi-value response. Some component analysis may be reconstructed with the original rubric, but naïve position-by-position comparison is invalid for unordered or equivalent answers. Invalid/incomplete input is rejected before it becomes a saved attempt.

## Other saved records

| Record | Details and limits |
|---|---|
| Runs | ID, chapter, group, practice flag, question objects, current index, pending answer, help state, complete flag and start time; adaptive runs also have an adaptive flag. There is no general explicit completion timestamp or active-duration field in these chapters. |
| Curriculum catalogue | Skill title, group, scope, source references, workbook mapping and prerequisites can be joined to skill IDs. These describe content, not observed learner behaviour. |
| Lesson completion | Completed group IDs; self-reported completion, not evidence of understanding. |
| Interactive labs | Latest saved control/input state where implemented; not a time-ordered history of exploration. |
| Written drafts | Latest saved text per group, saved time, chapter and review status. Saving overwrites the previous draft; no general revision history or teacher grading workflow. |
| Exposure | List of exposed form IDs; no complete timestamped history of each hint or explanation opening in Chapters 2–14. |
| Navigation | Last route for resuming; not a full clickstream. |
| Adaptive interventions | ID, skill, time, lesson-opened kind and rule version. Opening does not establish completion or comprehension. |
| Adaptive decision snapshots | ID, time, action, skill, rule/version, reason, contributing evidence IDs, exclusions, content version and selected item IDs. Available for recorded adaptive actions; do not assume every screen view creates a snapshot. |

## Chapter 1 differences

Chapter 1 uses an event log. Its common envelope includes event ID, type, browser session, placeholder learner `local-trial`, timestamp and content version. Answer events include skill/group, question ID, variant, template/family, difficulty label, format, parameters, fingerprint, options, selected text, correct answer, correctness, distractor tag, first-attempt flag, support flags, mode, conditions, question-opened time, first-interaction time, active seconds, timing-valid flag and remediation flag. Challenge answers also link to a run and include prompt/explanation snapshots.

The skill-practice path additionally logs option selections and answer changes, hint openings, explanation openings, and question views. Do not assume identical event coverage in every challenge path: answerChanged and errorCategory, for example, are not uniformly populated. Active timing measures browser activity, not verified attention.

Chapter 1 also saves remediation and decision history. Its teacher evidence lab contains explicitly simulated learner/cohort examples. These are not real peer data and must be excluded from account analytics. Shared adaptive UI overrides some older analysis presentation; older engine functions alone do not establish which reports the current UI exposes.

## Reports supported by the existing evidence

Once properly associated with an account and centrally stored, the present fields support:

- Chapter/lab/micro-skill attempt counts, correct counts, accuracy and coverage.
- Practice versus challenge results, using the linked run; supported versus independent results using evidence flags.
- Repeated versus fresh-form responses and question-form history.
- Run completion and progress, with unanswered questions distinguishable from submitted wrong answers.
- Descriptive activity by submission date and recent performance by skill.
- Wrong-answer review and response distributions on stable question versions.
- Written-reasoning review queues, with actual teacher assessment added separately.
- Adaptive recommendation explanations and descriptive results following recorded lesson openings.

An unattempted skill means insufficient evidence, not weakness. Keep supported/repeated work separate from fresh independent checks. A completed lesson is engagement evidence, not mastery.

## Reports that need more data or stronger foundations

| Desired report | Missing or limiting factor |
|---|---|
| Cross-device student history / school or class dashboard | Authenticated learner IDs, profile/cohort mapping and central persistence |
| Time per question / fluency across all chapters | Consistent active timing, pause/resume/visibility handling and timing validity |
| Hint dependency and answer-changing behaviour | Timestamped interaction events in all paths and chapters |
| Dropout / abandonment | Explicit session/run lifecycle and question-view events across chapters; incomplete does not necessarily mean abandoned |
| Difficulty-adjusted growth | Reviewed difficulty/comparability metadata and sufficient comparable fresh forms |
| Retention / secure skill claims | Sufficient fresh evidence over time and multiple task families |
| Misconception diagnosis | Reviewed item-specific distractor/error mappings; generic wrong answers do not identify a cause |
| Step-level mathematical reasoning | Structured steps or teacher-reviewed rubrics; saved final values are insufficient |
| Genuine peer comparisons | Real eligible account-linked peer data and matched assessment conditions |

The shared adaptive gate requires six fresh independent responses, five correct, two task families, and two sessions spanning at least a day. Chapters 2–14 generally offer only three challenge variants per skill, potentially fewer unique forms. The adapter also uses runId as a session fallback in those chapters. More registrations alone will not make an individual learner satisfy these evidence requirements. Expand the reviewed bank and define sessions consistently.

## Registration and analytics implementation priorities

1. Associate new evidence with a stable authenticated learner ID. Keep profile/cohort fields separate from responses; attach school, grade and class only when required for reporting.
2. Standardise event ID, learner ID, session ID, run/attempt ID, question version and client/server timestamps across chapters. Stable IDs must prevent duplicates during retries.
3. Persist original responses and support/exposure history centrally, with server-side ownership checks and grading where validated results are required.
4. Add explicit mode, run lifecycle, question-view, support-opened and timing events where the planned reports need them. Store rubric version and component scores if partial-credit reports are intended.
5. Preserve original content and rule versions so historical reports remain explainable. Use adapters for Chapter 1 and Chapters 2–14 rather than assuming matching schemas.
6. Treat existing browser data as unverified legacy history. Do not silently assign shared-device history to the next person who registers.
7. Launch descriptive accuracy/coverage/attempt reports first. Gate stronger growth, retention and peer claims on sufficient comparable data.

## Source evidence

Paths below are relative to the audited release package:

- `site/class-10/chapter-2/storage.js:8–28`: stores, run creation, submission fields and export. Submission field set also checked in Chapters 3–14.
- `site/class-10/chapter-2/app.js:14–27`: drafts, completion and reflection exposure.
- `site/class-10/chapter-2/activities.js:17–38`: latest lab state.
- `site/class-10/chapter-2/curriculum.js`: content taxonomy.
- `site/class-10/chapter-1/app.js:21,57–59,89`: event envelope and practice/challenge paths.
- `site/class-10/chapter-1/engine.js`: local storage, original analysis logic and simulated records.
- `site/assets/adaptive-ui.js`: chapter adapters, interventions, decisions and inventory.
- `site/assets/adaptive-engine.js`: eligibility and current evidence rules.
- `offline/Mathology Chapter 2.html:234`: bundled response fields match site submission fields.
- `analysis/ANALYSIS-SPECIFICATION.md`: future service contract; explicitly not a deployed analytics service. Its proposed fields must not be mistaken for fields already collected.
