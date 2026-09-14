import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { categoryLabel, priorityLabel, reportClassLabel, statusLabel } from "@/lib/format";
import { getReportsForExport } from "@/lib/queries";
import { parseFilters, type RawSearchParams } from "@/lib/search-params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV export of the currently filtered set.
 *
 * Reads through the *user's* client, so RLS still applies and the export can
 * never contain more than the person requesting it is allowed to see.
 */

/**
 * Escapes a CSV field.
 *
 * The leading apostrophe on =, +, - and @ is deliberate: without it a value
 * like `=1+1` is executed as a formula when the file is opened in Excel, which
 * turns an intake field into a code-execution path on a reviewer's machine.
 */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const COLUMNS: { header: string; get: (r: Record<string, unknown>) => unknown }[] = [
  { header: "Tiket", get: (r) => r.ticket },
  { header: "Tanggal masuk", get: (r) => r.created_at },
  { header: "Status", get: (r) => statusLabel(r.status as string) },
  { header: "Prioritas", get: (r) => priorityLabel(r.priority as string) },
  { header: "Jenis", get: (r) => reportClassLabel(r.report_class as string) },
  { header: "Kategori", get: (r) => categoryLabel(r.category as string) },
  { header: "Kategori asli", get: (r) => r.category_raw },
  { header: "Uraian kejadian", get: (r) => r.narrative },
  { header: "Tanggal kejadian", get: (r) => r.incident_at },
  { header: "Keterangan waktu", get: (r) => r.incident_at_text },
  { header: "Lokasi", get: (r) => r.location_text },
  { header: "Desa/Kelurahan", get: (r) => r.desa },
  { header: "Kecamatan", get: (r) => r.kecamatan },
  { header: "Kabupaten/Kota", get: (r) => r.kabupaten },
  { header: "Provinsi", get: (r) => r.provinsi },
  { header: "Terlapor", get: (r) => r.reported_party },
  { header: "Jabatan terlapor", get: (r) => r.reported_party_role },
  { header: "Bentuk pemberian", get: (r) => r.item_given },
  { header: "Nilai", get: (r) => r.item_value },
  { header: "Keterangan nilai", get: (r) => r.item_value_text },
  { header: "Perkiraan penerima", get: (r) => r.recipients_estimate },
  { header: "Jumlah saksi", get: (r) => r.witness_count },
  { header: "Ada bukti", get: (r) => (r.has_evidence ? "Ya" : "Tidak") },
  { header: "Keterangan bukti", get: (r) => r.evidence_note },
  { header: "Identitas dicantumkan", get: (r) => (r.identity_disclosed ? "Ya" : "Tidak") },
  { header: "Nama pelapor", get: (r) => r.reporter_name },
  { header: "Alamat pelapor", get: (r) => r.reporter_address },
  { header: "Kontak pelapor", get: (r) => r.reporter_contact },
  { header: "Kelengkapan (%)", get: (r) => r.completeness },
  { header: "Peringatan parser", get: (r) => (r.parse_warnings as string[])?.join(" | ") },
  { header: "Sumber", get: (r) => r.source },
  { header: "Catatan admin", get: (r) => r.admin_notes },
  { header: "Diarsipkan", get: (r) => (r.is_archived ? "Ya" : "Tidak") },
];

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  const params: RawSearchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseFilters(params);
  const rows = await getReportsForExport(filters);

  const lines = [
    COLUMNS.map((c) => csvField(c.header)).join(","),
    ...rows.map((row) =>
      COLUMNS.map((c) => csvField(c.get(row as unknown as Record<string, unknown>))).join(","),
    ),
  ];

  // BOM so Excel opens the file as UTF-8 rather than mangling Indonesian text.
  const body = `﻿${lines.join("\r\n")}`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
