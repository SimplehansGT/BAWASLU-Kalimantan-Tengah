/**
 * Environment access, split by trust level.
 *
 * The public values are safe in a browser bundle. The service role key is not:
 * it bypasses RLS entirely, so a single accidental import into a client
 * component would hand every report in the database to anyone who opens dev
 * tools. `serverEnv` is therefore guarded by `server-only`, which turns that
 * mistake into a build failure rather than a breach.
 */

/**
 * The Supabase URL and anon key, under every name they are published as.
 *
 * Two axes of variation, hence the list:
 *
 *  1. Supabase renamed the `anon` key to the "publishable" key. Older projects
 *     still issue the old name; newer ones issue the new one.
 *  2. NEXT_PUBLIC_* is inlined into the bundle at *build* time. The unprefixed
 *     names are read at *runtime* instead, which is the only thing that works
 *     when a host marks a variable as secret/sensitive and withholds it from
 *     the build — as Vercel does, and as the Supabase Vercel integration's own
 *     SUPABASE_URL / SUPABASE_ANON_KEY are exported.
 *
 * Every consumer of this runs on the server (server components, server actions,
 * middleware), so the runtime fallbacks are genuinely reachable. Only
 * lib/supabase/client.ts needs the build-time inlining, and nothing imports it.
 *
 * Each name is spelled out as a literal `process.env.X` because Next performs
 * the NEXT_PUBLIC_* substitution textually — a computed lookup would not match.
 * Neither of these values is a secret: the anon key is served to every visitor
 * by design, and RLS is what actually protects the data.
 */
export const publicEnv = {
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "",
};

export function assertPublicEnv() {
  const missing: string[] = [];
  if (!publicEnv.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publicEnv.supabaseAnonKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY (atau NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  }
  if (missing.length > 0) {
    throw new Error(
      `Konfigurasi Supabase belum lengkap. Variabel yang hilang: ${missing.join(", ")}. ` +
        `Salin .env.example ke .env.local dan isi nilainya.`,
    );
  }
}
