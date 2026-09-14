// Importing this module from a "use client" file is a build error. That is the
// whole point: everything below bypasses row level security.
import "server-only";

export const serverEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  intakeSecret: process.env.INTAKE_SECRET ?? "",
};

export function assertServiceRoleEnv() {
  const missing: string[] = [];
  if (!serverEnv.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serverEnv.serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(`Variabel lingkungan server belum diisi: ${missing.join(", ")}`);
  }
}
