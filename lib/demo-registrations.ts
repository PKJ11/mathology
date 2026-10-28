import "server-only";
import { collections } from "./db";
import { DEMO_DATES, DEMO_GRADES, DEMO_SLOTS } from "./demo-class";

export type DemoRegistration = {
  id: string;
  name: string;
  grade: string;
  school: string;
  phone: string;
  date: string;
  slot: string;
  createdAt: Date;
  updatedAt: Date;
  /** null while the confirmation hasn't been attempted yet */
  whatsappSent: boolean | null;
};

export type DemoFilter = { date?: string; slot?: string; grade?: string };

const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/** Keeps only filter values that exist, so a hand-edited URL can't produce odd queries. */
export const cleanFilter = (f: DemoFilter): DemoFilter => ({
  date: pick(f.date, DEMO_DATES),
  slot: pick(
    f.slot,
    DEMO_SLOTS.map((s) => s.id),
  ),
  grade: pick(f.grade, DEMO_GRADES),
});

/** Every booking, in class order. The campaign is small, so filtering happens in memory. */
export async function listDemoRegistrations(): Promise<DemoRegistration[]> {
  const { demoRegistrations } = await collections();
  const docs = await demoRegistrations.find().sort({ date: 1, slot: 1, createdAt: 1 }).toArray();
  return docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    grade: d.grade,
    school: d.school,
    phone: d.phone,
    date: d.date,
    slot: d.slot,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    whatsappSent: d.whatsapp ? d.whatsapp.sent : null,
  }));
}

export const matches = (r: DemoRegistration, f: DemoFilter) =>
  (!f.date || r.date === f.date) && (!f.slot || r.slot === f.slot) && (!f.grade || r.grade === f.grade);
