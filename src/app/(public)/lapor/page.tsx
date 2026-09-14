import { Lock, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { PublicReportForm } from "@/components/public/public-report-form";

export const metadata: Metadata = {
  title: "Lapor Dugaan Pelanggaran Pemilu",
  description:
    "Sampaikan dugaan pelanggaran pemilu kepada Bawaslu Kalimantan Tengah. Dapat dilakukan tanpa mencantumkan identitas.",
  // Inherited from the root layout, restated here so that the decision is
  // visible: the form is reachable by anyone with the link, but is kept out of
  // search results to limit automated abuse. Flip to index:true if Bawaslu
  // wants it discoverable.
  robots: { index: false, follow: false },
};

/**
 * The public reporting form — the only page in the application that does not
 * require a session, and the only write path open to the public.
 *
 * It is write-only by construction. Submission goes through a server action
 * running the service role, so the browser never holds a database credential,
 * the `anon` role keeps zero grants, and there is still no way to read a report
 * back from outside — not even the one you just submitted.
 */
export default function PublicReportPage() {
  return (
    <main className="min-h-dvh bg-muted/40">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" aria-hidden />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Laporkan Dugaan Pelanggaran Pemilu
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Bawaslu Kalimantan Tengah menerima laporan dari masyarakat mengenai
            dugaan pelanggaran pemilu. Anda tidak perlu membuat akun, dan Anda
            boleh melapor tanpa menyebutkan identitas.
          </p>

          <div className="mt-5 flex flex-col gap-2 rounded-lg border bg-card p-4">
            <p className="flex items-start gap-2 text-sm">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-pretty">
                Laporan Anda hanya dapat dibaca oleh pengawas pemilu yang
                berwenang. Isi laporan tidak dipublikasikan dan tidak dapat
                dilihat oleh masyarakat umum.
              </span>
            </p>
            <p className="flex items-start gap-2 text-sm">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="text-pretty">
                Setiap laporan diperlakukan sebagai{" "}
                <strong className="font-medium">dugaan yang belum diverifikasi</strong>.
                Menyampaikan laporan bukan berarti pihak yang dilaporkan telah
                dinyatakan bersalah.
              </span>
            </p>
          </div>
        </header>

        <PublicReportForm />

        <footer className="mt-10 border-t pt-6">
          <p className="text-xs text-muted-foreground text-pretty">
            Jika Anda dalam keadaan terancam atau kejadian sedang berlangsung,
            hubungi aparat setempat terlebih dahulu. Formulir ini tidak dipantau
            secara langsung setiap saat.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Bawaslu Kalimantan Tengah
          </p>
        </footer>
      </div>
    </main>
  );
}
