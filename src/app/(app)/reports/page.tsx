import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getFilterOptions, getReports } from "@/lib/queries";
import { parseFilters, parsePage, type RawSearchParams } from "@/lib/search-params";
import { PageHeader } from "@/components/page-header";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Laporan" };

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

async function ReportsContent({ params }: { params: RawSearchParams }) {
  const filters = parseFilters(params);
  const page = parsePage(params);

  const [{ rows, total, pageCount, error }, options] = await Promise.all([
    getReports(filters, page),
    getFilterOptions(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <ReportFilters options={options} />

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Gagal memuat laporan: {error}
        </p>
      ) : (
        <ReportTable rows={rows} total={total} page={page} pageCount={pageCount} />
      )}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Laporan"
        description="Semua laporan dan informasi awal yang diterima. Laporan urgent tampil di urutan teratas."
        actions={
          <Button render={<Link href="/reports/new" />}>
            <FilePlus2 className="size-4" aria-hidden />
            Laporan Baru
          </Button>
        }
      />

      <Suspense key={JSON.stringify(params)} fallback={<TableSkeleton />}>
        <ReportsContent params={params} />
      </Suspense>
    </div>
  );
}
