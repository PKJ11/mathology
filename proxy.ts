import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: real session checks happen in the pages and route handlers.
export function proxy(request: NextRequest) {
  if (request.cookies.has("mth_session")) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const next = pathname.startsWith("/lab/") ? pathname.replace(/^\/lab\//, "/chapters/") : pathname + search;
  const url = new URL("/login", request.url);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/chapters/:chapter+", "/lab/:path*", "/reports/:path*", "/reports", "/demo-registrations/:path*"],
};
