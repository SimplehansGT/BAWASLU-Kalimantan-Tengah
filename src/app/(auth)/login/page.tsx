import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { publicEnv } from "@/lib/env";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Masuk",
};

/**
 * The only public page in the application.
 *
 * There is deliberately no "daftar akun" link, no "lupa kata sandi" link and no
 * email field: accounts exist only because an admin created one from inside the
 * app, and a forgotten password is reset by an admin in person.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  // These are inlined into the bundle at build time, so an empty value here
  // means the build could not see them — not that the operator did anything
  // wrong. Say so before they waste attempts on a form that cannot work.
  const isMisconfigured = !publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey;

  if (isMisconfigured) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
        <div className="w-full max-w-lg">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950">
            <AlertTriangle
              className="size-8 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div>
              <h1 className="font-semibold text-amber-900 text-balance dark:text-amber-100">
                Aplikasi belum dikonfigurasi
              </h1>
              <p className="mt-1 text-sm text-amber-900/80 text-pretty dark:text-amber-200/80">
                Koneksi ke basis data belum tersedia, sehingga login tidak dapat
                diproses. Tidak ada data yang hilang — aplikasi hanya belum
                selesai disiapkan.
              </p>
            </div>

            <div className="w-full rounded-md border border-amber-300 bg-amber-100/60 p-3 text-left dark:border-amber-900 dark:bg-amber-900/30">
              <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                Untuk tim teknis:
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-amber-900/80 dark:text-amber-200/80">
                <li>
                  <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
                  <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                  kosong pada build ini.
                </li>
                <li>
                  Keduanya di-<em>inline</em> saat build, jadi harus berupa
                  variabel biasa — bukan <em>Sensitive</em>, yang hanya tersedia
                  saat runtime.
                </li>
                <li>
                  Setelah diperbaiki, deploy ulang tanpa <em>build cache</em>.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">
            Dashboard Pelaporan Pelanggaran Pemilu
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-balance">
            Masuk dengan akun yang diberikan oleh administrator.
          </p>
        </div>

        <LoginForm
          next={params.next ?? "/"}
          initialError={
            params.error === "nonaktif"
              ? "Akun Anda dinonaktifkan. Hubungi administrator."
              : null
          }
        />

        <p className="mt-6 text-center text-xs text-muted-foreground text-balance">
          Sistem ini memuat data dugaan pelanggaran yang bersifat terbatas.
          Setiap akses tercatat.
        </p>
      </div>
    </main>
  );
}
