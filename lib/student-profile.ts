// Lab registration fields shared by the form and the server action.

export const STUDENT_GRADES = ["6", "7", "8", "9", "10", "11", "12"] as const;

const MIN_AGE = 4;
const MAX_AGE = 25;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function yearsAgo(years: number, now: Date) {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

/** Bounds for the date-of-birth picker. */
export const dobRange = (now = new Date()) => ({ min: isoDate(yearsAgo(MAX_AGE, now)), max: isoDate(yearsAgo(MIN_AGE, now)) });

export function isValidDob(dob: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const d = new Date(`${dob}T00:00:00Z`);
  // Rejects dates like 2012-02-31, which Date would roll over
  if (Number.isNaN(d.getTime()) || isoDate(d) !== dob) return false;
  const { min, max } = dobRange(now);
  return dob >= min && dob <= max;
}

export const isIndianMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

/** "+919876543210" → "+91 98765 43210"; anything else (e.g. an email) is returned as is. */
export function formatPhone(phone: string) {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}
