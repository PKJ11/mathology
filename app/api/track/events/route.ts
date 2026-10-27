import { IngestError, ingestEvents } from "@/lib/track/ingest";
import { readTrackRequest } from "@/lib/track/request";

export async function POST(request: Request) {
  const req = await readTrackRequest(request, 1_000_000);
  if ("error" in req) return req.error;

  try {
    const result = await ingestEvents(req.userId, req.body, request.headers.get("user-agent"));
    return Response.json(result);
  } catch (err) {
    if (err instanceof IngestError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
