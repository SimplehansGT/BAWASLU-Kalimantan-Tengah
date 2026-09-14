/**
 * Seeds the database with synthetic reports.
 *
 * Inserts the ten spec payloads verbatim — every one of them must land without
 * error — plus generated reports spread across the last 60 days so the
 * dashboard has something to aggregate.
 *
 *   npx tsx scripts/seed.ts            # 10 fixtures + 40 generated
 *   npx tsx scripts/seed.ts --count=500
 *   npx tsx scripts/seed.ts --reset    # delete existing rows first
 *
 * Every name, place and figure below is invented. Never point this at a
 * database holding real reports.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { normalizeReport } from "../src/lib/normalize";
import { SAMPLE_PAYLOADS } from "../src/lib/sample-payloads";

config({ path: ".env.local" });

// ------------------------------------------------------------- fixtures

const KECAMATAN = [
  { kecamatan: "Pahandut", kabupaten: "Palangka Raya" },
  { kecamatan: "Jekan Raya", kabupaten: "Palangka Raya" },
  { kecamatan: "Sabangau", kabupaten: "Palangka Raya" },
  { kecamatan: "Bukit Batu", kabupaten: "Palangka Raya" },
  { kecamatan: "Katingan Hilir", kabupaten: "Katingan" },
  { kecamatan: "Kahayan Hilir", kabupaten: "Pulang Pisau" },
  { kecamatan: "Arut Selatan", kabupaten: "Kotawaringin Barat" },
  { kecamatan: "Mentawa Baru Ketapang", kabupaten: "Kotawaringin Timur" },
  { kecamatan: "Dusun Selatan", kabupaten: "Barito Selatan" },
  { kecamatan: "Kapuas Murung", kabupaten: "Kapuas" },
];

const DESA = ["Sukamaju", "Tumbang Rungan", "Bereng Bengkel", "Kalampangan", "Marang", "Sabaru"];

const CATEGORY_TEMPLATES: {
  category: string;
  narratives: string[];
  item_given?: string[];
  valueRange?: [number, number];
}[] = [
  {
    category: "politik uang",
    narratives: [
      "Ada pembagian uang tunai kepada warga menjelang hari pemungutan suara sambil diminta memilih calon tertentu.",
      "Warga menerima amplop berisi uang pada malam hari di sekitar balai RT.",
      "Sembako dibagikan oleh tim sukses dengan pesan agar memilih nomor urut tertentu.",
      "Terjadi serangan fajar berupa pembagian uang di beberapa rumah warga.",
    ],
    item_given: ["uang tunai", "sembako", "amplop", "voucher belanja"],
    valueRange: [20000, 300000],
  },
  {
    category: "intimidasi",
    narratives: [
      "Pelapor diancam akan kehilangan pekerjaan jika tidak memilih calon tertentu.",
      "Ada tekanan dari atasan agar seluruh karyawan memilih calon yang sama.",
      "Warga didatangi dan diperingatkan agar tidak menghadiri kegiatan calon lain.",
    ],
  },
  {
    category: "penyalahgunaan fasilitas negara",
    narratives: [
      "Kendaraan dinas digunakan untuk mengangkut peserta kampanye.",
      "Kegiatan kampanye digelar di balai desa pada jam kerja.",
      "Aparat desa terlibat aktif mengarahkan warga untuk memilih calon tertentu.",
    ],
  },
  {
    category: "pelanggaran kampanye",
    narratives: [
      "Alat peraga kampanye masih terpasang di masa tenang.",
      "Kampanye dilakukan di lingkungan tempat ibadah.",
      "Terdapat konten kampanye yang memuat ujaran kebencian berbasis SARA.",
      "Anak di bawah umur dilibatkan dalam konvoi kampanye.",
    ],
  },
  {
    category: "pelanggaran pemungutan suara",
    narratives: [
      "Ada dugaan pemilih yang mencoblos lebih dari satu kali di TPS.",
      "Saksi dari salah satu calon diminta meninggalkan ruang penghitungan.",
      "Terdapat selisih angka antara formulir hasil dan rekapitulasi.",
    ],
  },
  {
    category: "kode etik penyelenggara",
    narratives: [
      "Anggota penyelenggara diduga menunjukkan keberpihakan kepada salah satu calon.",
      "Penyelenggara menghadiri kegiatan internal salah satu peserta pemilu.",
    ],
  },
];

const REPORTED_PARTIES = [
  "Pak Darmawan",
  "Tim sukses calon nomor 2",
  "Bu Ratna",
  "Kepala Desa Marang",
  "Saudara Anto",
  "Panitia kampanye wilayah utara",
  "Pak Yusuf",
  "Seorang ASN kecamatan",
];

const TIME_PHRASES = [
  "kemarin malam",
  "tadi pagi",
  "abis isya",
  "dua hari lalu",
  "minggu lalu",
  "sekitar jam 8 malam",
];

const STATUSES = ["baru", "ditinjau", "diteruskan", "ditutup", "bukan_pelanggaran", "duplikat"];

// ------------------------------------------------------------- helpers

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** A timestamp somewhere in the last `days` days. */
function randomRecentDate(days = 60): Date {
  const now = Date.now();
  return new Date(now - randomInt(0, days * 24 * 60) * 60 * 1000);
}

function buildGeneratedPayload(): Record<string, unknown> {
  const template = pick(CATEGORY_TEMPLATES);
  const place = pick(KECAMATAN);
  const identityDisclosed = chance(0.4);
  const hasEvidence = chance(0.45);

  const payload: Record<string, unknown> = {
    narrative: pick(template.narratives),
    category: template.category,
    kecamatan: place.kecamatan,
    kabupaten: place.kabupaten,
    provinsi: "Kalimantan Tengah",
    has_evidence: hasEvidence,
    identity_disclosed: identityDisclosed,
    priority: chance(0.3) ? "urgent" : "normal",
  };

  if (chance(0.8)) payload.desa = pick(DESA);
  if (chance(0.7)) payload.incident_at_text = pick(TIME_PHRASES);
  if (chance(0.6)) payload.incident_at = randomRecentDate(60).toISOString();
  if (chance(0.65)) payload.reported_party = pick(REPORTED_PARTIES);
  if (chance(0.4)) payload.reported_party_role = pick(["tim sukses", "ASN", "kepala desa", "warga"]);
  if (chance(0.5)) payload.witness_count = randomInt(1, 12);

  if (template.item_given && chance(0.75)) {
    payload.item_given = pick(template.item_given);
  }

  // Only some money-politics reports carry a figure. That gap is the point of
  // the "Estimasi nilai" denominator on the dashboard.
  if (template.valueRange && chance(0.55)) {
    const [min, max] = template.valueRange;
    payload.item_value = Math.round(randomInt(min, max) / 5000) * 5000;
    payload.recipients_estimate = randomInt(5, 120);
  } else if (template.valueRange && chance(0.3)) {
    payload.item_value_text = pick(["sekitar 50 ribuan", "katanya 100rb", "tidak jelas berapa"]);
  }

  if (hasEvidence) {
    payload.evidence_note = pick([
      "Ada foto amplop yang dibagikan.",
      "Rekaman video pendek dari warga.",
      "Tangkapan layar percakapan grup.",
    ]);
  }

  if (identityDisclosed) {
    payload.reporter_name = pick([
      "Budi Santoso",
      "Siti Aminah",
      "Ahmad Fauzi",
      "Ratna Sari",
      "Joko Prasetyo",
    ]);
    payload.reporter_address = `${pick(DESA)}, ${place.kecamatan}`;
    payload.reporter_contact = `08${randomInt(1000000000, 9999999999)}`;
  }

  return payload;
}

// ------------------------------------------------------------------ main

async function main() {
  const args = process.argv.slice(2);
  const countArg = args.find((a) => a.startsWith("--count="));
  const generatedCount = countArg ? Number(countArg.split("=")[1]) : 40;
  const reset = args.includes("--reset");

  if (!Number.isFinite(generatedCount) || generatedCount < 0) {
    console.error("--count harus berupa angka.");
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

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (reset) {
    console.log("Menghapus laporan yang ada…");
    // report_events and attachments cascade from reports.
    const { error } = await supabase
      .from("reports")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.error("Gagal menghapus:", error.message);
      process.exit(1);
    }
  }

  let inserted = 0;
  let failed = 0;
  const failures: string[] = [];

  // ---- the ten spec fixtures -------------------------------------------
  console.log(`\nMemasukkan ${SAMPLE_PAYLOADS.length} muatan uji dari spesifikasi…`);

  for (const sample of SAMPLE_PAYLOADS) {
    const { row, warnings } = normalizeReport(sample.payload);
    row.source = "api";
    row.source_meta = { seeded: true, fixture: sample.label };

    // Payload 7 carries nothing but a transcript; everything else needs at
    // least something, and the API path would file the body as raw text.
    if (!row.narrative && !row.raw_transcript) {
      row.raw_transcript = JSON.stringify(sample.payload);
    }

    const { data, error } = await supabase.from("reports").insert(row).select("id").single();

    if (error || !data) {
      failed += 1;
      failures.push(`${sample.label}: ${error?.message}`);
      continue;
    }

    inserted += 1;
    await supabase.from("report_events").insert({
      report_id: data.id,
      event_type: "created",
      to_value: "baru",
      detail: { source: "seed", warnings },
    });

    const warnNote = warnings.length > 0 ? ` (${warnings.length} peringatan)` : "";
    console.log(`  ✓ ${sample.label}${warnNote}`);
  }

  // ---- generated volume -------------------------------------------------
  console.log(`\nMembuat ${generatedCount} laporan sintetis…`);

  for (let i = 0; i < generatedCount; i += 1) {
    const payload = buildGeneratedPayload();
    const { row, warnings } = normalizeReport(payload);

    const createdAt = randomRecentDate(60);
    row.created_at = createdAt.toISOString();
    row.source = pick(["api", "whatsapp", "web", "manual"]);
    row.source_meta = { seeded: true };

    // Older reports are more likely to have been worked already.
    const ageDays = (Date.now() - createdAt.getTime()) / 86_400_000;
    const status = ageDays > 7 && chance(0.7) ? pick(STATUSES) : "baru";
    row.status = status;

    const { data, error } = await supabase.from("reports").insert(row).select("id").single();

    if (error || !data) {
      failed += 1;
      if (failures.length < 5) failures.push(`sintetis #${i}: ${error?.message}`);
      continue;
    }

    inserted += 1;

    const events: Record<string, unknown>[] = [
      {
        report_id: data.id,
        event_type: "created",
        to_value: "baru",
        created_at: createdAt.toISOString(),
        detail: { source: "seed", warnings },
      },
    ];

    // A status change event so the response-time panel has something real to
    // measure rather than an empty median.
    if (status !== "baru") {
      const respondedAt = new Date(
        createdAt.getTime() + randomInt(30, 96 * 60) * 60 * 1000,
      );
      events.push({
        report_id: data.id,
        event_type: "status_changed",
        from_value: "baru",
        to_value: status,
        created_at: respondedAt.toISOString(),
      });
    }

    await supabase.from("report_events").insert(events);

    if ((i + 1) % 50 === 0) console.log(`  … ${i + 1}/${generatedCount}`);
  }

  console.log(`\nSelesai. ${inserted} laporan tersimpan, ${failed} gagal.`);
  if (failures.length > 0) {
    console.log("\nKegagalan:");
    for (const f of failures) console.log(`  ✗ ${f}`);
  }

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Kesalahan tak terduga:", error);
  process.exit(1);
});
