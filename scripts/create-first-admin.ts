/**
 * Bootstraps the first administrator account.
 *
 * This is the only way an account comes into existence outside the app, and it
 * exists because of a chicken-and-egg problem: account creation inside the app
 * requires an authenticated admin session, and at install time there is none.
 *
 * Run it locally, never from a deployed environment:
 *   npx tsx scripts/create-first-admin.ts <username> [password]
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INTERNAL_EMAIL_DOMAIN = "internal.lapor";

function generatePassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--force");
  const force = process.argv.includes("--force");

  const rawUsername = args[0];
  if (!rawUsername) {
    console.error("Penggunaan: npx tsx scripts/create-first-admin.ts <username> [password]");
    process.exit(1);
  }

  const username = normalizeUsername(rawUsername);
  if (username.length < 3) {
    console.error("Nama pengguna minimal 3 karakter (huruf kecil, angka, . _ -).");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus diisi di .env.local.",
    );
    process.exit(1);
  }

  const password = args[1] ?? generatePassword();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Refuse to run casually once the system is live: from that point on, accounts
  // belong to the admin UI where every creation is attributable.
  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (countError) {
    console.error("Gagal membaca tabel profiles:", countError.message);
    console.error("Pastikan migrasi supabase/migrations/0001_init.sql sudah dijalankan.");
    process.exit(1);
  }

  if ((count ?? 0) > 0 && !force) {
    console.error(
      `Sudah ada ${count} akun. Buat akun berikutnya dari halaman /admin/users ` +
        "agar tercatat siapa yang membuatnya.\n" +
        "Jalankan ulang dengan --force hanya jika Anda benar-benar terkunci di luar sistem.",
    );
    process.exit(1);
  }

  const email = `${username}@${INTERNAL_EMAIL_DOMAIN}`;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    // The address is synthetic and nothing is ever sent to it, so it is
    // pre-confirmed rather than waiting on a mail that will never arrive.
    email_confirm: true,
    user_metadata: { username },
  });

  if (createError || !created.user) {
    console.error("Gagal membuat akun:", createError?.message);
    process.exit(1);
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    username,
    full_name: null,
    role: "admin",
    created_by: null,
  });

  if (profileError) {
    // Leave nothing half-created: an auth user with no profile can log in but
    // has no role, which is a confusing state to debug later.
    await supabase.auth.admin.deleteUser(created.user.id);
    console.error("Gagal menyimpan profil, akun dibatalkan:", profileError.message);
    process.exit(1);
  }

  console.log("\n  Akun administrator pertama dibuat.\n");
  console.log(`  Nama pengguna : ${username}`);
  console.log(`  Kata sandi    : ${password}\n`);
  console.log("  Simpan kata sandi ini sekarang — tidak ada email dan tidak ada");
  console.log("  pemulihan mandiri. Ganti melalui /admin/users setelah masuk.\n");
}

main().catch((error) => {
  console.error("Kesalahan tak terduga:", error);
  process.exit(1);
});
