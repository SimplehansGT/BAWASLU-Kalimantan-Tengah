import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { assertServiceRoleEnv, serverEnv } from "@/lib/server-env";
import type { Database } from "@/types/database";

/**
 * Service role client. Bypasses RLS.
 *
 * Only two things may use this: the ingest route (which has no user session to
 * act as) and admin user management (which needs the auth admin API). Never
 * reach for it to make an ordinary page query easier — RLS is the control that
 * keeps allegation data off the public internet.
 */
export function createAdminClient() {
  assertServiceRoleEnv();

  return createSupabaseClient<Database>(serverEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
