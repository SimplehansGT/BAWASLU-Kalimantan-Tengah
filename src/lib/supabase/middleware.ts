import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** Paths reachable without a session. Everything else redirects to /login. */
const PUBLIC_PATHS = ["/login"];

/**
 * Paths that authenticate themselves and must not be redirected.
 *
 * Matched exactly, never by prefix: a prefix match would silently exempt any
 * future route nested under /api/reports from the session guard.
 */
const SELF_AUTHENTICATED_PATHS = ["/api/reports"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isSelfAuthenticated(pathname: string) {
  return SELF_AUTHENTICATED_PATHS.includes(pathname);
}

/**
 * Refreshes the Supabase session cookie and enforces the auth guard.
 *
 * The response object has to be the one the Supabase client wrote cookies onto,
 * which is why it is threaded through rather than rebuilt.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // With no Supabase config there is nothing to verify against. Fail closed:
  // send everything to /login rather than silently serving protected pages.
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    if (isPublic(request.nextUrl.pathname) || isSelfAuthenticated(request.nextUrl.pathname)) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates against the auth server. getSession() only reads the
  // cookie, which a client could forge, so it must not be used for the guard.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (isSelfAuthenticated(pathname)) return response;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were heading so login can bounce them back.
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
