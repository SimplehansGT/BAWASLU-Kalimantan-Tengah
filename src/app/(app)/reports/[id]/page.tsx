import { ArrowLeft, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { EMPTY_FIELD_TEXT } from "@/lib/constants";
import {
  boolLabel,
  categoryLabel,
  displayValue,
  formatDateTime,
  formatNumber,
  formatRupiah,
} from "@/lib/format";
import { getReport, getSignedAttachmentUrls } from "@/lib/queries";
import type { ReportRow } from "@/types/database";
import { PageHeader } from "@/components/page-header";
import { AttachmentGrid } from "@/components/reports/attachment-grid";
import { AuditLog } from "@/components/reports/audit-log";
import { EditableField } from "@/components/reports/editable-field";
import { ExtraData, RawTranscript } from "@/components/reports/extra-data";
import {
  CompletenessBar,
  PriorityBadge,
  ReportClassBadge,
  StatusBadge,
  WarningChips,
} from "@/components/reports/report-badges";
import { ReviewPanel } from "@/components/reports/review-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getReport(id);
  return { title: detail ? detail.report.ticket : "Laporan tidak ditemukan" };
}

/** One group of fields, rendered in the same order as the intake form. */
function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y py-0">{children}</CardContent>
    </Card>
  );
}

function textOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [detail, user] = await Promise.all([getReport(id), getSessionUser()]);
  if (!detail) notFound();

  const { report, attachments, events } = detail;
  const canEdit = user?.profile?.role === "admin";

  // Signed per request with a 60-second life, never stored.
  const signedUrls = await getSignedAttachmentUrls(
    attachments.map((a) => a.storage_path),
    60,
  );
  const attachmentsWithUrls = attachments.map((a) => ({
    ...a,
    signedUrl: signedUrls.get(a.storage_path) ?? null,
  }));

  const field = (key: keyof ReportRow) => report[key];

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
          title={report.ticket}
          description={`Diterima ${formatDateTime(report.created_at)} · Sumber: ${report.source}`}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge value={report.status} />
          <PriorityBadge value={report.priority} />
          <ReportClassBadge value={report.report_class} />
          {report.is_archived ? <Badge variant="secondary">Diarsipkan</Badge> : null}
          <span className="ml-1">
            <CompletenessBar value={report.completeness} />
          </span>
        </div>

        {report.updated_at !== report.created_at ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            Terakhir diperbarui {formatDateTime(report.updated_at)}
          </p>
        ) : null}
      </div>

      {report.parse_warnings.length > 0 ? (
        <WarningChips warnings={report.parse_warnings} />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---- left: the record itself ---- */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FieldGroup title="Kejadian">
            <EditableField
              reportId={report.id}
              field="narrative"
              label="Uraian kejadian"
              value={textOf(field("narrative"))}
              display={displayValue(field("narrative"))}
              editable={canEdit}
              multiline
            />
            <EditableField
              reportId={report.id}
              field="incident_at_text"
              label="Keterangan waktu"
              value={textOf(field("incident_at_text"))}
              display={displayValue(field("incident_at_text"))}
              editable={canEdit}
            />
            <div className="py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Tanggal kejadian (hasil penguraian)
              </span>
              <p className="mt-0.5 text-sm">
                {report.incident_at ? formatDateTime(report.incident_at) : EMPTY_FIELD_TEXT}
              </p>
            </div>
            <EditableField
              reportId={report.id}
              field="location_text"
              label="Lokasi"
              value={textOf(field("location_text"))}
              display={displayValue(field("location_text"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="desa"
              label="Desa/Kelurahan"
              value={textOf(field("desa"))}
              display={displayValue(field("desa"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="kecamatan"
              label="Kecamatan"
              value={textOf(field("kecamatan"))}
              display={displayValue(field("kecamatan"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="kabupaten"
              label="Kabupaten/Kota"
              value={textOf(field("kabupaten"))}
              display={displayValue(field("kabupaten"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="provinsi"
              label="Provinsi"
              value={textOf(field("provinsi"))}
              display={displayValue(field("provinsi"))}
              editable={canEdit}
            />
          </FieldGroup>

          <FieldGroup title="Terlapor">
            <EditableField
              reportId={report.id}
              field="reported_party"
              label="Nama/ciri terlapor"
              value={textOf(field("reported_party"))}
              display={displayValue(field("reported_party"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="reported_party_role"
              label="Jabatan atau peran"
              value={textOf(field("reported_party_role"))}
              display={displayValue(field("reported_party_role"))}
              editable={canEdit}
            />
          </FieldGroup>

          <FieldGroup title="Dugaan">
            <EditableField
              reportId={report.id}
              field="category"
              label="Kategori"
              value={textOf(field("category"))}
              display={report.category ? categoryLabel(report.category) : EMPTY_FIELD_TEXT}
              editable={canEdit}
            />
            <div className="py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Kategori asli dari intake
              </span>
              <p className="mt-0.5 text-sm">{displayValue(field("category_raw"))}</p>
            </div>
            <EditableField
              reportId={report.id}
              field="item_given"
              label="Bentuk pemberian"
              value={textOf(field("item_given"))}
              display={displayValue(field("item_given"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="item_value"
              label="Nilai"
              value={textOf(field("item_value"))}
              display={
                report.item_value === null ? EMPTY_FIELD_TEXT : formatRupiah(report.item_value)
              }
              editable={canEdit}
              type="number"
            />
            <EditableField
              reportId={report.id}
              field="item_value_text"
              label="Keterangan nilai"
              value={textOf(field("item_value_text"))}
              display={displayValue(field("item_value_text"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="recipients_estimate"
              label="Perkiraan penerima"
              value={textOf(field("recipients_estimate"))}
              display={
                report.recipients_estimate === null
                  ? EMPTY_FIELD_TEXT
                  : formatNumber(report.recipients_estimate)
              }
              editable={canEdit}
              type="number"
            />
            <EditableField
              reportId={report.id}
              field="witness_count"
              label="Jumlah saksi"
              value={textOf(field("witness_count"))}
              display={
                report.witness_count === null
                  ? EMPTY_FIELD_TEXT
                  : formatNumber(report.witness_count)
              }
              editable={canEdit}
              type="number"
            />
          </FieldGroup>

          <FieldGroup title="Bukti">
            <div className="py-2">
              <span className="text-xs font-medium text-muted-foreground">Ada bukti</span>
              <p className="mt-0.5 text-sm">{boolLabel(report.has_evidence)}</p>
            </div>
            <EditableField
              reportId={report.id}
              field="evidence_note"
              label="Keterangan bukti"
              value={textOf(field("evidence_note"))}
              display={displayValue(field("evidence_note"))}
              editable={canEdit}
              multiline
            />
            <div className="py-3">
              <span className="mb-2 block text-xs font-medium text-muted-foreground">
                Lampiran ({attachments.length})
              </span>
              <AttachmentGrid attachments={attachmentsWithUrls} />
              {attachments.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tautan lampiran hanya berlaku 60 detik dan dibuat ulang setiap
                  halaman dimuat.
                </p>
              ) : null}
            </div>
          </FieldGroup>

          <FieldGroup title="Pelapor">
            <div className="py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Identitas dicantumkan
              </span>
              <p className="mt-0.5 text-sm">{boolLabel(report.identity_disclosed)}</p>
            </div>
            <EditableField
              reportId={report.id}
              field="reporter_name"
              label="Nama pelapor"
              value={textOf(field("reporter_name"))}
              display={displayValue(field("reporter_name"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="reporter_address"
              label="Alamat pelapor"
              value={textOf(field("reporter_address"))}
              display={displayValue(field("reporter_address"))}
              editable={canEdit}
            />
            <EditableField
              reportId={report.id}
              field="reporter_contact"
              label="Kontak pelapor"
              value={textOf(field("reporter_contact"))}
              display={displayValue(field("reporter_contact"))}
              editable={canEdit}
            />
          </FieldGroup>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data tambahan</CardTitle>
            </CardHeader>
            <CardContent>
              <ExtraData extra={report.extra} />
            </CardContent>
          </Card>

          {report.raw_transcript ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Transkrip asli</CardTitle>
              </CardHeader>
              <CardContent>
                <RawTranscript transcript={report.raw_transcript} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* ---- right: review controls and audit ---- */}
        <div className="flex flex-col gap-4">
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-base">Penanganan</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewPanel
                reportId={report.id}
                status={report.status}
                priority={report.priority}
                notes={report.admin_notes}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Jejak audit</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditLog events={events} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
