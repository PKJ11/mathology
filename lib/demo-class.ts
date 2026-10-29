// Temporary: free demo classes for Grades 7 and 8 (November 2026). Shared by the popup and the server action.

export const DEMO_GRADES = ["7", "8"] as const;

export const DEMO_DATES = [
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-11",
  "2026-11-12",
  "2026-11-13",
  "2026-11-14",
] as const;

export const DEMO_SLOTS = [
  { id: "16-17", label: "4 – 5 pm", startHour: 16 },
  { id: "17-18", label: "5 – 6 pm", startHour: 17 },
] as const;

export type DemoSlotId = (typeof DEMO_SLOTS)[number]["id"];

/** Each grade has its own class time. */
export const GRADE_SLOT: Record<(typeof DEMO_GRADES)[number], DemoSlotId> = { "7": "16-17", "8": "17-18" };

export const slotForGrade = (grade: string): DemoSlotId | undefined => GRADE_SLOT[grade as keyof typeof GRADE_SLOT];

const TIME_ZONE = "Asia/Kolkata";

/** Classes run in India time, whatever the visitor's clock says. */
export function slotStart(date: string, slotId: string): Date | null {
  const slot = DEMO_SLOTS.find((s) => s.id === slotId);
  if (!slot) return null;
  return new Date(`${date}T${String(slot.startHour).padStart(2, "0")}:00:00+05:30`);
}

/** A slot can be booked until it starts. */
export function isSlotOpen(date: string, slotId: string, now = new Date()) {
  const start = slotStart(date, slotId);
  return !!start && start > now;
}

export const isDateOpen = (date: string, now = new Date()) => DEMO_SLOTS.some((s) => isSlotOpen(date, s.id, now));

/** False once the last slot has started: the button and popup then disappear on their own. */
export const demoIsRunning = (now = new Date()) => DEMO_DATES.some((d) => isDateOpen(d, now));

export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE }).format(
    new Date(`${date}T12:00:00+05:30`),
  );
}

export const slotLabel = (slotId: string) => DEMO_SLOTS.find((s) => s.id === slotId)?.label ?? slotId;
