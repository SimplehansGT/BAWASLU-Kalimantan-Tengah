/**
 * The ten intake payloads from the build spec.
 *
 * Shared by the "Muat contoh" button on the intake form and by the seed script,
 * so the fixtures the UI demonstrates and the fixtures the database is seeded
 * with can never drift apart. Every one of these must insert successfully.
 *
 * No import of anything framework-specific: this module is loaded by a plain
 * node script as well as by a client component.
 */

/** Payload 8 needs a genuinely long narrative to prove nothing truncates it. */
function longNarrative(targetLength = 8000): string {
  const sentences = [
    "Pada malam hari sekitar pukul delapan, sejumlah orang berkumpul di halaman rumah warga di RT 04.",
    "Mereka membagikan amplop berisi uang kepada warga yang hadir sambil menyebut nomor urut calon tertentu.",
    "Beberapa warga menolak menerima, namun sebagian besar menerima karena merasa sungkan.",
    "Salah seorang yang membagikan mengaku sebagai tim sukses, tetapi tidak menunjukkan identitas apa pun.",
    "Kejadian ini berlangsung sekitar empat puluh menit dan disaksikan oleh banyak warga sekitar.",
    "Saya mencatat ciri kendaraan yang digunakan berupa mobil berwarna gelap tanpa pelat yang jelas.",
    "Warga sempat merekam sebagian kejadian menggunakan telepon genggam meskipun kondisi kurang terang.",
    "Setelah pembagian selesai, rombongan tersebut meninggalkan lokasi menuju arah jalan utama desa.",
  ];

  let out = "";
  let i = 0;
  while (out.length < targetLength) {
    out += `${sentences[i % sentences.length]} `;
    i += 1;
  }
  return out.slice(0, targetLength);
}

export type SamplePayload = {
  label: string;
  note: string;
  payload: Record<string, unknown>;
};

export const SAMPLE_PAYLOADS: SamplePayload[] = [
  {
    label: "1 · Lengkap dan rapi",
    note: "Semua kolom terisi seperti yang diharapkan.",
    payload: {
      narrative:
        "Ada pembagian uang Rp 50.000 per orang di RT 03 sambil diminta memilih calon nomor 2.",
      incident_at: "2026-02-11T20:30:00+07:00",
      desa: "Sukamaju",
      kecamatan: "Cibiru",
      kabupaten: "Bandung",
      category: "politik uang",
      item_given: "uang tunai",
      item_value: 50000,
      recipients_estimate: 40,
      witness_count: 3,
      has_evidence: true,
      identity_disclosed: true,
      reporter_name: "Budi Santoso",
      reporter_address: "Sukamaju, Cibiru",
      reporter_contact: "0812xxxxxxx",
    },
  },
  {
    label: "2 · Minimum",
    note: "Hanya satu baris uraian. Harus tetap tersimpan.",
    payload: { narrative: "bagi bagi duit di kampung" },
  },
  {
    label: "3 · Bahasa sehari-hari",
    note: "Waktu relatif dan nilai yang kabur.",
    payload: {
      narrative: "td malem ada yg bagi2 amplop abis isya deket masjid",
      incident_at_text: "tadi malam",
      location_text: "deket masjid al ikhlas",
      item_value_text: "50rban kayaknya",
      category: "kayanya money politic",
    },
  },
  {
    label: "4 · Kolom tak dikenal",
    note: "Kolom asing harus masuk ke data tambahan, bukan menimbulkan error.",
    payload: {
      narrative: "Sembako dibagikan sambil kampanye.",
      kecamatan: "Lembang",
      cuaca: "hujan",
      nomor_tps: "TPS 14",
      mood_pelapor: "marah",
      random_field_from_ai: { nested: true, count: 7 },
    },
  },
  {
    label: "5 · Tipe data salah semua",
    note: "Harus dikonversi atau diberi peringatan, tidak boleh gagal.",
    payload: {
      narrative: 12345,
      witness_count: "banyak banget",
      item_value: "Rp 100.000,-",
      identity_disclosed: "iya",
      incident_at: "kemarin",
      priority: "SANGAT URGENT",
    },
  },
  {
    label: "6 · Data identitas sensitif",
    note: "NIK dan nomor rekening harus ditolak dan tidak tersimpan di mana pun.",
    payload: {
      narrative: "Saya melihat pembagian uang.",
      reporter_name: "Siti",
      reporter_nik: "3273010101900001",
      nomor_rekening: "1234567890",
    },
  },
  {
    label: "7 · Hanya transkrip",
    note: "Ditolak formulir, tetapi diterima lewat API sebagai teks mentah.",
    payload: { raw_transcript: "halo?? ini gimana ya" },
  },
  {
    label: "8 · Uraian sangat panjang",
    note: "Sekitar 8.000 karakter. Tidak boleh dipotong.",
    payload: { narrative: longNarrative(8000) },
  },
  {
    label: "9 · Jalur urgent",
    note: "Intimidasi dengan prioritas urgent.",
    payload: {
      narrative: "Saya diancam akan dipecat kalau tidak memilih calon tertentu.",
      category: "intimidasi",
      priority: "urgent",
      kecamatan: "Cicendo",
    },
  },
  {
    label: "10 · Tanggal di masa depan",
    note: "Diberi peringatan, tetapi tetap diterima.",
    payload: {
      narrative: "Kejadian pembagian sembako.",
      incident_at: "2027-12-31",
    },
  },
];
