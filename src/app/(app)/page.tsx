import {
  AlertTriangle,
  CalendarClock,
  FileCheck2,
  FilePlus2,
  Files,
  Gauge,
  Inbox,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CATEGORY_LABELS, STATUS_LABELS, type Category, type Status } from "@/lib/constants";
import { formatDateTime, formatPercent } from "@/lib/format";
import {
  computeCountsBy,
  computeDaily,
  computeIdentityByCategory,
  computeQuality,
  computeStats,
  computeTopReportedParties,
  computeValueEstimate,
  getAnalyticsRows,
  getFilterOptions,
  getReports,
  getResponseTime,
} from "@/lib/queries";
import { parseFilters, type RawSearchParams } from "@/lib/search-params";
import { EmptyState, PageHeader } from "@/components/page-header";
import {
  QualityPanel,
  ResponseTimePanel,
  TopReportedParties,
  ValueEstimatePanel,
} from "@/components/dashboard/analysis-panels";
import {
  CategoryChart,
  DailyReportsChart,
  IdentityByCategoryChart,
  KecamatanChart,
  StatusDonut,
} from "@/components/dashboard/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { ReportFilters } from "@/components/reports/report-filters";
import {
  CategoryBadge,
  PriorityBadge,
  StatusBadge,
} from "@/components/reports/report-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Beranda" };

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    </div>
  );
}

async function DashboardContent({ params }: { params: RawSearchParams }) {
  const filters = parseFilters(params);

  const [{ rows, capped }, options, responseTime, recent] = await Promise.all([
    getAnalyticsRows(filters),
    getFilterOptions(),
    getResponseTime(filters),
    getReports(filters, 1, 8),
  ]);

  const stats = computeStats(rows, capped);

  // With nothing in the database the charts would all render as empty frames,
  // which looks broken rather than new. Show a real empty state instead.
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <ReportFilters options={options} showSearch={false} showListOnly={false} />
        <EmptyState
          icon={Inbox}
          title="Belum ada laporan yang masuk."
          description={
            Object.keys(params).length > 0
              ? "Tidak ada laporan yang cocok dengan filter ini. Coba longgarkan filternya."
              : "Statistik dan grafik akan muncul setelah laporan pertama diterima."
          }
          action={
            <Button render={<Link href="/reports/new" />} size="sm">
              <FilePlus2 className="size-4" aria-hidden />
              Catat laporan pertama
            </Button>
          }
        />
      </div>
    );
  }

  const daily = computeDaily(rows, 30);
  const byCategory = computeCountsBy(
    rows,
    "category",
    (k) => CATEGORY_LABELS[k as Category] ?? k,
  );
  const byKecamatan = computeCountsBy(
    rows,
    "kecamatan",
    (k) => (k === "lainnya" ? "Tidak disebutkan" : k),
    10,
  );
  const byStatus = computeCountsBy(rows, "status", (k) => STATUS_LABELS[k as Status] ?? k);
  const identityByCategory = computeIdentityByCategory(
    rows,
    (k) => CATEGORY_LABELS[k as Category] ?? k,
  );
  const topParties = computeTopReportedParties(rows, 10);
  const valueEstimate = computeValueEstimate(rows);
  const quality = computeQuality(rows);

  const formalRatio =
    stats.total === 0 ? 0 : (stats.laporanCount / stats.total) * 100;

  return (
    <div className="flex flex-col gap-6">
      <ReportFilters options={options} showSearch={false} showListOnly={false} />

      {capped ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Analisis dibatasi pada 10.000 laporan terbaru. Persempit rentang
          tanggal untuk angka yang tepat.
        </p>
      ) : null}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total laporan"
          value={stats.total.toLocaleString("id-ID")}
          icon={Files}
        />
        <StatCard
          label="Belum ditinjau"
          value={stats.unreviewed.toLocaleString("id-ID")}
          hint={stats.unreviewed > 0 ? "Berstatus baru" : "Semua sudah ditinjau"}
          icon={Inbox}
          tone={stats.unreviewed > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Urgent aktif"
          value={stats.urgentOpen.toLocaleString("id-ID")}
          hint="Prioritas urgent, belum ditutup"
          icon={AlertTriangle}
          tone={stats.urgentOpen > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Laporan resmi"
          value={`${stats.laporanCount} : ${stats.informasiAwalCount}`}
          hint={`${formatPercent(formalRatio)} memenuhi syarat formal`}
          icon={FileCheck2}
        />
        <StatCard
          label="Rata-rata kelengkapan"
          value={formatPercent(stats.avgCompleteness)}
          icon={Gauge}
          tone={stats.avgCompleteness >= 60 ? "success" : "warning"}
        />
        <StatCard
          label="Masuk 7 hari terakhir"
          value={stats.last7Days.toLocaleString("id-ID")}
          icon={CalendarClock}
        />
      </div>

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle>Laporan masuk per hari</CardTitle>
          <CardDescription>30 hari terakhir, dengan garis terpisah untuk urgent.</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyReportsChart data={daily} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dugaan per kategori</CardTitle>
            <CardDescription>Diurutkan dari yang paling banyak dilaporkan.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryChart data={byCategory} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sebaran status</CardTitle>
            <CardDescription>Posisi seluruh laporan dalam alur penanganan.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusDonut data={byStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10 kecamatan teratas</CardTitle>
            <CardDescription>Berdasarkan jumlah laporan yang diterima.</CardDescription>
          </CardHeader>
          <CardContent>
            <KecamatanChart data={byKecamatan} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identitas pelapor per kategori</CardTitle>
            <CardDescription>
              Kategori dengan pelapor anonim yang tinggi biasanya menandakan rasa
              tidak aman.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IdentityByCategoryChart data={identityByCategory} />
          </CardContent>
        </Card>
      </div>

      {/* Analysis */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopReportedParties data={topParties} />
        <div className="flex flex-col gap-4">
          <ValueEstimatePanel data={valueEstimate} />
          <ResponseTimePanel data={responseTime} />
        </div>
        <QualityPanel data={quality} />

        {/* Recent reports */}
        <Card>
          <CardHeader>
            <CardTitle>Laporan terbaru</CardTitle>
            <CardDescription>Delapan laporan terakhir yang masuk.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {recent.rows.map((row) => (
                <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`/reports/${row.id}`} className="group flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium group-hover:underline">
                        {row.ticket}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </span>
                    </div>
                    {row.narrative ? (
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {row.narrative}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      <CategoryBadge value={row.category} />
                      <StatusBadge value={row.status} />
                      {row.priority === "urgent" ? <PriorityBadge value="urgent" /> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Beranda"
        description="Ringkasan laporan dugaan pelanggaran pemilu yang diterima."
        actions={
          <Button render={<Link href="/reports/new" />}>
            <FilePlus2 className="size-4" aria-hidden />
            Laporan Baru
          </Button>
        }
      />

      <Suspense key={JSON.stringify(params)} fallback={<DashboardSkeleton />}>
        <DashboardContent params={params} />
      </Suspense>
    </div>
  );
}
