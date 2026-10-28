import { getChapter } from "@/app/chapters/chapters";
import { getCurrentUser, toObjectId } from "@/lib/auth";
import { chapterHtml, chapterStoreKeys } from "@/lib/chapter-files";
import { collections } from "@/lib/db";

const TRACKER_VERSION = "2";

// The chapter's own logo links to its in-page start screen (#home); send it to the site homepage instead.
// Capture phase, registered before the chapter scripts, so their own handlers never see the click.
const BRAND_TO_HOME = `addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a.brand");if(!a)return;e.preventDefault();e.stopImmediatePropagation();(window.top||window).location.href="/";},true);`;

// Serves a chapter's self-contained HTML with the interaction tracker injected ahead of
// the chapter scripts, plus the learner's last synced state so progress follows them.
export async function GET(request: Request, { params }: { params: Promise<{ chapter: string }> }) {
  const chapter = getChapter((await params).chapter);
  if (!chapter) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  const userId = user && toObjectId(user.id);
  if (!user || !userId) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `/chapters/chapter-${chapter.number}`);
    return Response.redirect(login, 302);
  }

  const { chapterState } = await collections();
  const keys = chapterStoreKeys(chapter.number);
  const saved = await chapterState
    .find({ userId, chapter: chapter.number, key: { $in: keys } }, { projection: { key: 1, raw: 1, savedAt: 1 } })
    .toArray();

  const boot = {
    v: 1,
    uid: user.id,
    chapter: chapter.number,
    keys,
    endpoint: "/api/track",
    state: Object.fromEntries(saved.map((s) => [s.key, { raw: s.raw, savedAt: s.savedAt.getTime() }])),
  };
  // Escape "<" so learner text in saved state can never close the script tag
  const json = JSON.stringify(boot)
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028))
    .join("\\u2028")
    .split(String.fromCharCode(0x2029))
    .join("\\u2029");
  const inject =
    `<script>window.__MTH__=${json};</script><script src="/mathology-tracker.js?v=${TRACKER_VERSION}"></script>` +
    `<script>${BRAND_TO_HOME}</script>`;

  const html = await chapterHtml(chapter.number);
  const body = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inject) : inject + html;

  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-frame-options": "SAMEORIGIN",
    },
  });
}
