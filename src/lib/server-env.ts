// Importing this module from a "use client" file is a build error. That is the
// whole point: everything below bypasses row level security.
import "server-only";

/**
 * Supabase renamed `service_role` to the "secret" key. The Vercel integration
 * exports SUPABASE_SECRET_KEY; older projects and manual setups use
 * SUPABASE_SERVICE_ROLE_KEY. Either is accepted — both bypass RLS completely
 * and neither may ever be prefixed NEXT_PUBLIC_.
 */
export const serverEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
  serviceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "",
  intakeSecret: process.env.INTAKE_SECRET ?? "",
};

export function assertServiceRoleEnv() {
  const missing: string[] = [];
  if (!serverEnv.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serverEnv.serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY (atau SUPABASE_SECRET_KEY)");
  }
  if (missing.length > 0) {
    throw new Error(`Variabel lingkungan server belum diisi: ${missing.join(", ")}`);
  }
}
