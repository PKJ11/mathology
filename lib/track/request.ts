import "server-only";
import { getCurrentUser, toObjectId } from "../auth";

/** Shared guard for tracking endpoints: same-origin, signed in, bounded JSON body. */
export async function readTrackRequest(request: Request, maxBytes: number) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return { error: Response.json({ error: "Cross-origin request" }, { status: 403 }) } as const;
  }

  const user = await getCurrentUser();
  const userId = user && toObjectId(user.id);
  if (!userId) return { error: Response.json({ error: "Not signed in" }, { status: 401 }) } as const;

  const text = await request.text();
  if (text.length > maxBytes) return { error: Response.json({ error: "Body too large" }, { status: 413 }) } as const;

  try {
    return { userId, body: JSON.parse(text) as unknown } as const;
  } catch {
    return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) } as const;
  }
}
