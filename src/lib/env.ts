/**
 * Environment access, split by trust level.
 *
 * The public values are safe in a browser bundle. The service role key is not:
 * it bypasses RLS entirely, so a single accidental import into a client
 * component would hand every report in the database to anyone who opens dev
 * tools. `serverEnv` is therefore guarded by `server-only`, which turns that
 * mistake into a build failure rather than a breach.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export function assertPublicEnv() {
  const missing: string[] = [];
  if (!publicEnv.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publicEnv.supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Konfigurasi Supabase belum lengkap. Variabel yang hilang: ${missing.join(", ")}. ` +
        `Salin .env.example ke .env.local dan isi nilainya.`,
    );
  }
}
