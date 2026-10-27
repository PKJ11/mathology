import { chapterStoreKeys } from "@/lib/chapter-files";
import { collections, isDuplicateKey } from "@/lib/db";
import { readTrackRequest } from "@/lib/track/request";

const MAX_STATE_BYTES = 4_000_000;

// Stores the latest raw snapshot of one chapter store so the learner can resume on any device.
export async function POST(request: Request) {
  const req = await readTrackRequest(request, MAX_STATE_BYTES + 2_000);
  if ("error" in req) return req.error;

  const body = req.body as { chapter?: unknown; key?: unknown; raw?: unknown; savedAt?: unknown };
  const chapter = typeof body.chapter === "number" ? body.chapter : NaN;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 14)
    return Response.json({ error: "Unknown chapter" }, { status: 400 });
  if (typeof body.key !== "string" || !chapterStoreKeys(chapter).includes(body.key))
    return Response.json({ error: "Unknown store key" }, { status: 400 });
  if (typeof body.raw !== "string") return Response.json({ error: "Missing state" }, { status: 400 });
  try {
    JSON.parse(body.raw);
  } catch {
    return Response.json({ error: "State is not valid JSON" }, { status: 400 });
  }

  const savedAt = new Date(typeof body.savedAt === "number" ? body.savedAt : Date.now());
  const { chapterState } = await collections();
  try {
    // Only replace an older snapshot; a stale write that loses the race is ignored
    await chapterState.updateOne(
      { userId: req.userId, chapter, key: body.key, savedAt: { $lte: savedAt } },
      { $set: { raw: body.raw, bytes: body.raw.length, savedAt, updatedAt: new Date() } },
      { upsert: true },
    );
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    return Response.json({ ok: true, stale: true });
  }
  return Response.json({ ok: true });
}
