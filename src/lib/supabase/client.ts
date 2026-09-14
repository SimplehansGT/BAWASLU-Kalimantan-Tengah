"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Browser client. Anon key only — RLS is what keeps reports private.
 *
 * Currently unused: every query in this app runs server-side, which is why the
 * app works even when the Supabase config is only available at runtime.
 *
 * If you do start using this, note that it needs the NEXT_PUBLIC_* spellings
 * specifically. The runtime fallbacks in lib/env.ts resolve to undefined in a
 * browser bundle, so a host that withholds those from the build (Vercel's
 * "Sensitive" variables) would leave this client with an empty key.
 */
export function createClient() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Supabase browser client needs NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY to be readable at build time.",
    );
  }
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
