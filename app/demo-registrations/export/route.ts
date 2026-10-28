import { canViewOthers, getCurrentUser } from "@/lib/auth";
import { slotLabel } from "@/lib/demo-class";
import { cleanFilter, listDemoRegistrations, matches } from "@/lib/demo-registrations";
import { formatPhone } from "@/lib/student-profile";

// Spreadsheet apps run cells starting with these as formulas
const cell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canViewOthers(user.role)) return new Response("Not found", { status: 404 });

  const params = new URL(request.url).searchParams;
  const filter = cleanFilter({
    date: params.get("date") ?? undefined,
    slot: params.get("slot") ?? undefined,
    grade: params.get("grade") ?? undefined,
  });
  const rows = (await listDemoRegistrations()).filter((r) => matches(r, filter));

  const lines = [
    ["Name", "Grade", "School", "Phone", "Date", "Time", "Registered at (UTC)", "WhatsApp"],
    ...rows.map((r) => [
      r.name,
      r.grade,
      r.school,
      // Spaces keep spreadsheets from reading the number as a formula or in scientific notation
      formatPhone(r.phone).replace(/^\+/, ""),
      r.date,
      slotLabel(r.slot),
      r.createdAt.toISOString(),
      r.whatsappSent === null ? "pending" : r.whatsappSent ? "sent" : "failed",
    ]),
  ].map((cols) => cols.map(cell).join(","));

  const name = ["demo-bookings", filter.date, filter.slot, filter.grade && `grade-${filter.grade}`].filter(Boolean).join("_");
  // BOM so Excel opens it as UTF-8
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
