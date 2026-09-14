/**
 * Vocabulary shared by the normaliser, the UI and the queries.
 *
 * The category buckets are a closed set for *storage and aggregation*, but the
 * intake side is deliberately open: whatever the AI or the operator typed is
 * always kept verbatim in `category_raw`. See normalize.ts.
 */

// ------------------------------------------------------------------ category

export const CATEGORIES = [
  "politik_uang",
  "penyalahgunaan_fasilitas",
  "intimidasi_kekerasan",
  "pelanggaran_kampanye",
  "pelanggaran_pemungutan",
  "kode_etik",
  "bukan_pelanggaran",
  "lainnya",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  politik_uang: "Politik Uang",
  penyalahgunaan_fasilitas: "Penyalahgunaan Fasilitas",
  intimidasi_kekerasan: "Intimidasi & Kekerasan",
  pelanggaran_kampanye: "Pelanggaran Kampanye",
  pelanggaran_pemungutan: "Pelanggaran Pemungutan Suara",
  kode_etik: "Pelanggaran Kode Etik",
  bukan_pelanggaran: "Bukan Pelanggaran",
  lainnya: "Lainnya",
};

/**
 * Keyword → bucket. Matched as substrings against a lowercased, punctuation-
 * flattened version of the input, so "bagi2" and "bagi-bagi" both hit.
 *
 * Order within a bucket does not matter; order of the buckets themselves is the
 * tie-breaker when an input matches more than one (first listed wins), which is
 * why `bukan_pelanggaran` sits near the top — "bukan pelanggaran, cuma spanduk"
 * should not be filed as a campaign violation.
 */
export const CATEGORY_SYNONYMS: Record<Category, string[]> = {
  bukan_pelanggaran: [
    "bukan pelanggaran",
    "tidak melanggar",
    "bukan dugaan",
    "salah paham",
    "hoaks",
    "hoax",
    "tidak terbukti",
    "klarifikasi",
  ],
  politik_uang: [
    "politik uang",
    "politik duit",
    "money politic",
    "money politik",
    "money game",
    "uang",
    "duit",
    "amplop",
    "serangan fajar",
    "sembako",
    "bagi bagi",
    "bagibagi",
    "bagi2",
    "dibagikan",
    "pembagian",
    "suap",
    "sogok",
    "imbalan",
    "beli suara",
    "jual beli suara",
    "doorprize",
    "door prize",
    "bansos",
    "sedekah politik",
    "gratifikasi",
    "transfer",
    "voucher",
    "kupon",
  ],
  intimidasi_kekerasan: [
    "intimidasi",
    "intimidatif",
    "ancam",
    "mengancam",
    "todong",
    "pukul",
    "kekerasan",
    "teror",
    "paksa",
    "dipaksa",
    "pemaksaan",
    "tekanan",
    "ditekan",
    "represif",
    "premanisme",
    "pecat",
    "dipecat",
    "penganiayaan",
    "aniaya",
  ],
  penyalahgunaan_fasilitas: [
    "fasilitas negara",
    "fasilitas pemerintah",
    "mobil dinas",
    "kendaraan dinas",
    "rumah dinas",
    "kantor desa",
    "balai desa",
    "gedung pemerintah",
    "anggaran negara",
    "apbd",
    "apbn",
    "dana desa",
    "netralitas asn",
    "asn tidak netral",
    "keterlibatan asn",
    "aparat desa",
    "kepala desa",
    "kades",
    "camat",
    "lurah",
    "bumn",
    "penyalahgunaan wewenang",
    "abuse of power",
  ],
  pelanggaran_kampanye: [
    "kampanye",
    "alat peraga",
    "apk",
    "baliho",
    "spanduk",
    "poster",
    "banner",
    "stiker",
    "kampanye hitam",
    "black campaign",
    "sara",
    "ujaran kebencian",
    "hate speech",
    "fitnah",
    "kampanye di luar jadwal",
    "masa tenang",
    "tempat ibadah",
    "libatkan anak",
    "konvoi",
    "arak arakan",
  ],
  pelanggaran_pemungutan: [
    "tps",
    "pemungutan",
    "penghitungan",
    "coblos",
    "nyoblos",
    "surat suara",
    "kotak suara",
    "bilik suara",
    "dpt",
    "daftar pemilih",
    "rekapitulasi",
    "c1",
    "formulir c",
    "pleno",
    "mencoblos lebih",
    "pemilih ganda",
    "pemilih siluman",
    "kpps",
    "saksi diusir",
    "penggelembungan suara",
  ],
  kode_etik: [
    "kode etik",
    "etik penyelenggara",
    "dkpp",
    "penyelenggara tidak netral",
    "kpu tidak netral",
    "bawaslu tidak netral",
    "ppk",
    "pps",
    "panwas",
    "keberpihakan penyelenggara",
    "konflik kepentingan",
  ],
  lainnya: [],
};

// ------------------------------------------------------------------ status

export const STATUSES = [
  "baru",
  "ditinjau",
  "diteruskan",
  "ditutup",
  "bukan_pelanggaran",
  "duplikat",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  baru: "Baru",
  ditinjau: "Ditinjau",
  diteruskan: "Diteruskan",
  ditutup: "Ditutup",
  bukan_pelanggaran: "Bukan Pelanggaran",
  duplikat: "Duplikat",
};

/** Statuses that still need someone to act. Drives the "Urgent aktif" card. */
export const OPEN_STATUSES: Status[] = ["baru", "ditinjau", "diteruskan"];

// ------------------------------------------------------------------ priority

export const PRIORITIES = ["normal", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  normal: "Normal",
  urgent: "Urgent",
};

/** Words that flip an incoming free-text priority to urgent. */
export const URGENT_KEYWORDS = [
  "urgent",
  "urgen",
  "mendesak",
  "darurat",
  "segera",
  "penting",
  "prioritas tinggi",
  "high",
  "tinggi",
  "sangat",
];

// --------------------------------------------------------------- report class

export const REPORT_CLASSES = ["informasi_awal", "laporan"] as const;
export type ReportClass = (typeof REPORT_CLASSES)[number];

export const REPORT_CLASS_LABELS: Record<ReportClass, string> = {
  informasi_awal: "Informasi Awal",
  laporan: "Laporan Resmi",
};

// ------------------------------------------------------------------ boolean

/** Indonesian truthy/falsy words accepted by normalizeBoolean. */
export const TRUE_WORDS = [
  "true",
  "ya",
  "iya",
  "y",
  "yes",
  "benar",
  "betul",
  "ada",
  "sudah",
  "setuju",
  "1",
  "on",
  "aktif",
];

export const FALSE_WORDS = [
  "false",
  "tidak",
  "ga",
  "gak",
  "nggak",
  "engga",
  "enggak",
  "n",
  "no",
  "bukan",
  "belum",
  "tidak ada",
  "0",
  "off",
  "nonaktif",
];

// ------------------------------------------------------------------ security

/**
 * HARD CONSTRAINT: keys matching this are dropped outright — not stored in the
 * column, not in `extra`, not in `payload`. Keeping a NIK would turn an
 * allegation record into an identity-theft target.
 */
export const SENSITIVE_KEY_PATTERN = /nik|ktp|rekening|npwp|passport/i;

// ------------------------------------------------------------------ intake

/** Where a row came from. */
export const SOURCES = ["manual", "api", "whatsapp", "web"] as const;
export type Source = (typeof SOURCES)[number];

/** Synthetic domain that turns a username into an auth.users email. */
export const INTERNAL_EMAIL_DOMAIN = "internal.lapor";

// ------------------------------------------------------------------ ui labels

/** Field labels for the detail page and the form, in display order per group. */
export const FIELD_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: "Kejadian",
    fields: [
      { key: "narrative", label: "Uraian kejadian" },
      { key: "incident_at", label: "Tanggal kejadian" },
      { key: "incident_at_text", label: "Keterangan waktu" },
      { key: "location_text", label: "Lokasi" },
      { key: "desa", label: "Desa/Kelurahan" },
      { key: "kecamatan", label: "Kecamatan" },
      { key: "kabupaten", label: "Kabupaten/Kota" },
      { key: "provinsi", label: "Provinsi" },
    ],
  },
  {
    title: "Terlapor",
    fields: [
      { key: "reported_party", label: "Nama/ciri terlapor" },
      { key: "reported_party_role", label: "Jabatan atau peran" },
    ],
  },
  {
    title: "Dugaan",
    fields: [
      { key: "category", label: "Kategori" },
      { key: "category_raw", label: "Kategori asli dari intake" },
      { key: "item_given", label: "Bentuk pemberian" },
      { key: "item_value", label: "Nilai" },
      { key: "item_value_text", label: "Keterangan nilai" },
      { key: "recipients_estimate", label: "Perkiraan penerima" },
      { key: "witness_count", label: "Jumlah saksi" },
    ],
  },
  {
    title: "Bukti",
    fields: [
      { key: "has_evidence", label: "Ada bukti" },
      { key: "evidence_note", label: "Keterangan bukti" },
    ],
  },
  {
    title: "Pelapor",
    fields: [
      { key: "identity_disclosed", label: "Identitas dicantumkan" },
      { key: "reporter_name", label: "Nama pelapor" },
      { key: "reporter_address", label: "Alamat pelapor" },
      { key: "reporter_contact", label: "Kontak pelapor" },
    ],
  },
];

/** Placeholder shown for a field the intake never filled in. */
export const EMPTY_FIELD_TEXT = "— belum diisi —";

/**
 * Fields counted by the "Kualitas laporan" panel when working out what the
 * intake most often fails to capture.
 */
export const COMPLETENESS_FIELDS: { key: string; label: string }[] = [
  { key: "narrative", label: "Uraian kejadian" },
  { key: "incident_at_text", label: "Waktu kejadian" },
  { key: "kecamatan", label: "Lokasi kecamatan" },
  { key: "has_evidence", label: "Bukti" },
  { key: "reported_party", label: "Terlapor" },
  { key: "reporter_name", label: "Identitas pelapor" },
];

export const PAGE_SIZE = 25;
