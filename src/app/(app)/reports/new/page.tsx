import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { IntakeForm } from "@/components/reports/intake-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Laporan Baru" };

/**
 * Manual intake — for now the stand-in for the AI chat bot.
 *
 * Built to be permissive on purpose: it exercises the same normalisation path
 * the bot will use, so unrealistic input is a feature here, not an edge case.
 */
export default function NewReportPage() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-3 gap-1.5"
          render={<Link href="/reports" />}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke daftar
        </Button>

        <PageHeader
          title="Laporan Baru"
          description="Catat laporan yang masuk melalui kanal apa pun, atau tempel muatan JSON dari bot intake."
        />
      </div>

      <div className="max-w-4xl">
        <IntakeForm />
      </div>
    </div>
  );
}
