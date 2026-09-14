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
 * Supabase renamed its API keys: the `anon` key became the "publishable" key.
 * Projects created before the change still issue the old name, and the Vercel
 * integration exports whichever the project has — so both are accepted.
 *
 * Each name is spelled out as a literal `process.env.X`. Next inlines
 * NEXT_PUBLIC_* values at build time by static substitution, so a computed
 * lookup would come back undefined in the browser.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
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
