import { Info } from "lucide-react";

import { formatHours, formatRupiah } from "@/lib/format";
import type { QualityReport, ReportedPartyPoint, ValueEstimate } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompletenessChart } from "@/components/dashboard/charts";

/**
 * Terlapor paling sering disebut.
 *
 * The "dugaan, belum diverifikasi" wording in the header is required, not
 * decorative. This panel ranks *named private individuals* by how often they
 * have been accused, and without that qualifier a frequency count reads as a
 * finding of guilt.
 */
export function TopReportedParties({ data }: { data: ReportedPartyPoint[] }) {
  const max = data[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terlapor paling sering disebut</CardTitle>
        <CardDescription className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Semua nama di bawah ini berasal dari dugaan yang dilaporkan dan{" "}
            <strong className="font-medium">belum diverifikasi</strong>. Jumlah
            sebutan bukan indikasi bersalah.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Belum ada terlapor yang dicatat namanya.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.map((item) => (
              <li key={item.name} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Disebut dalam {item.count} laporan (dugaan, belum diverifikasi)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{ width: `${(item.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Estimasi nilai politik uang.
 *
 * The denominator is shown alongside the total on purpose: a sum over the
 * minority of reports that happened to carry a figure is not "the total value
 * of money politics", and presenting it as one would be misleading.
 */
export function ValueEstimatePanel({ data }: { data: ValueEstimate }) {
  const totalReports = data.withValue + data.withoutValue;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimasi nilai (politik uang)</CardTitle>
        <CardDescription>
          Hanya laporan berkategori politik uang yang mencantumkan angka.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {totalReports === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Belum ada laporan politik uang.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Jumlah nilai tercatat</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatRupiah(data.sum)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Median per laporan</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {data.median === null ? "—" : formatRupiah(data.median)}
                </p>
              </div>
            </div>

            <div className="rounded-md bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground text-pretty">
                Angka di atas dihitung dari{" "}
                <strong className="font-medium text-foreground">
                  {data.withValue} dari {totalReports}
                </strong>{" "}
                laporan politik uang.{" "}
                <strong className="font-medium text-foreground">{data.withoutValue}</strong>{" "}
                laporan tidak mencantumkan nilai, sehingga jumlah sebenarnya
                hampir pasti lebih besar.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function QualityPanel({ data }: { data: QualityReport }) {
  const topMissing = data.missing[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kualitas laporan</CardTitle>
        <CardDescription>
          Sebaran skor kelengkapan terhadap syarat formal dan materiel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CompletenessChart data={data.distribution} />

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Kolom yang paling sering kosong
          </p>
          <ul className="flex flex-col gap-1.5">
            {data.missing.slice(0, 4).map((field) => (
              <li key={field.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{field.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {field.count} laporan
                </span>
              </li>
            ))}
          </ul>
          {topMissing && topMissing.count > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              Paling sering hilang: <strong className="font-medium">{topMissing.label}</strong>.
              Ini kandidat pertanyaan tambahan untuk bot intake.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ResponseTimePanel({
  data,
}: {
  data: { medianHours: number | null; measured: number; pending: number };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kecepatan tindak lanjut</CardTitle>
        <CardDescription>
          Waktu dari laporan masuk hingga perubahan status pertama.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Median</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {data.medianHours === null ? "—" : formatHours(data.medianHours)}
          </p>
        </div>

        <div className="rounded-md bg-muted/60 px-3 py-2">
          <p className="text-xs text-muted-foreground text-pretty">
            Dihitung dari{" "}
            <strong className="font-medium text-foreground">{data.measured}</strong> laporan
            yang sudah ditindaklanjuti.{" "}
            <strong className="font-medium text-foreground">{data.pending}</strong> laporan
            belum pernah berubah status sejak diterima.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
