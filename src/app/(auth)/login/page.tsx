import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

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
