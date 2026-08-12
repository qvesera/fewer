import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session cookie on every app request.
 * The app works fully logged-out; this only keeps an existing session alive.
 *
 * The homepage/app split is handled in `src/app/page.tsx`, which reads the
 * Host header at render time — this is more reliable than attempting a
 * rewrite here, because prerendered pages can be served without running
 * middleware.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Use the raw Host header (this is what CDNs/proxies forward to the origin).
  const host = (request.headers.get("host") ?? request.nextUrl.hostname)
    .toLowerCase()
    .replace(/:\d+$/, "");

  // Permanent redirect for the www subdomain -> apex.
  if (host === "www.fewer.directory") {
    const target = request.nextUrl.clone();
    target.hostname = "fewer.directory";
    target.protocol = "https:";
    return NextResponse.redirect(target, 308);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Refresh session if expired — required for Server Components.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except static assets and Next internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|woff2?)$).*)",
  ],
};