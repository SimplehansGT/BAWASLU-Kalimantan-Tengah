/**
 * The normalisation layer.
 *
 * Contract: **nothing in this file may throw.** Every exported function takes
 * `unknown` and returns a result. The AI intake is unreliable by nature, and a
 * parser exception here would mean a citizen's report is lost — which is the
 * one failure mode the whole design is built to prevent.
 *
 * Rules that drive the code below:
 *  - Lossy is fine, losing data is not. Originals go to `payload`,
 *    `raw_transcript`, `category_raw`, `incident_at_text` and `extra`.
 *  - Unknown keys land in `extra` verbatim rather than being dropped.
 *  - Keys that look like national identity numbers are dropped everywhere,
 *    including from `payload`. That is the single exception to "never drop".
 */

import {
  CATEGORIES,
  CATEGORY_SYNONYMS,
  FALSE_WORDS,
  SENSITIVE_KEY_PATTERN,
  TRUE_WORDS,
  URGENT_KEYWORDS,
  type Category,
  type Priority,
} from "@/lib/constants";
import type { Json, ReportInsert } from "@/types/database";

export type ParseResult<T> = { value: T | null; warning?: string };

// --------------------------------------------------------------------- utils

/** Lowercase, strip punctuation, collapse whitespace. "bagi-bagi" -> "bagi bagi" */
function flatten(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Best-effort string form of anything. Objects become JSON so that a structured
 * value sent where text was expected is still readable rather than "[object
 * Object]".
 */
function stringify(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean") return String(input);
  try {
    // JSON.stringify returns undefined for symbols and functions, so the
    // coalesce is load-bearing: callers rely on getting string | null.
    return JSON.stringify(input) ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ category

/**
 * Maps free text onto a bucket. Never returns null and never throws: anything
 * unrecognised becomes `lainnya` with a warning, and the caller is expected to
 * keep the untouched input in `category_raw`.
 */
export function normalizeCategory(input: unknown): ParseResult<string> {
  const text = stringify(input);

  if (text === null || text.trim() === "") {
    return {
      value: "lainnya",
      warning: "Kategori tidak disebutkan, dipakai 'lainnya'.",
    };
  }

  const haystack = flatten(text);

  // Exact bucket key, e.g. the UI sending back "politik_uang".
  const asKey = haystack.replace(/\s+/g, "_");
  if ((CATEGORIES as readonly string[]).includes(asKey)) {
    return { value: asKey };
  }

  // Score every bucket by how much of it the input matches. Longer keywords
  // win over shorter ones so "bukan pelanggaran" beats a bare "pelanggaran".
  let best: { bucket: Category; score: number } | null = null;

  for (const bucket of CATEGORIES) {
    let score = 0;
    for (const keyword of CATEGORY_SYNONYMS[bucket]) {
      if (haystack.includes(flatten(keyword))) {
        score = Math.max(score, keyword.length);
      }
    }
    if (score > 0 && (best === null || score > best.score)) {
      best = { bucket, score };
    }
  }

  if (best) return { value: best.bucket };

  return {
    value: "lainnya",
    warning: `Kategori "${text}" tidak dikenali, dipakai 'lainnya'.`,
  };
}

// ---------------------------------------------------------------------- date

const RELATIVE_UNIT_DAYS: Record<string, number> = {
  hari: 1,
  minggu: 7,
  pekan: 7,
  bulan: 30,
  tahun: 365,
};

/**
 * Indonesian relative time. Returns a Date or null.
 *
 * Deliberately coarse: "tadi malam" resolves to 20:00 yesterday, not to a
 * precise instant. The exact words always survive in `incident_at_text`, so
 * approximating here costs nothing a reviewer cannot recover.
 */
function parseRelativeIndonesian(text: string, now: Date): Date | null {
  const t = flatten(text);
  if (t === "") return null;

  const at = (base: Date, hours: number, minutes = 0) => {
    const d = new Date(base);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };
  const shiftDays = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d;
  };

  // "2 hari lalu", "3 minggu yang lalu", "sebulan lalu"
  const nAgo = t.match(/(\d+)\s*(hari|minggu|pekan|bulan|tahun)\s*(?:yang\s*)?(?:lalu|kemarin)/);
  if (nAgo) {
    const n = Number(nAgo[1]);
    const days = RELATIVE_UNIT_DAYS[nAgo[2]] ?? 1;
    if (Number.isFinite(n)) return shiftDays(-n * days);
  }

  // "2 jam lalu", "30 menit lalu"
  const hAgo = t.match(/(\d+)\s*(jam|menit)\s*(?:yang\s*)?lalu/);
  if (hAgo) {
    const n = Number(hAgo[1]);
    if (Number.isFinite(n)) {
      const d = new Date(now);
      if (hAgo[2] === "jam") d.setHours(d.getHours() - n);
      else d.setMinutes(d.getMinutes() - n);
      return d;
    }
  }

  // Bare unit words: "seminggu lalu", "minggu lalu", "bulan lalu"
  const bareAgo = t.match(/\b(?:se)?(hari|minggu|pekan|bulan|tahun)\s*(?:yang\s*)?lalu/);
  if (bareAgo) return shiftDays(-(RELATIVE_UNIT_DAYS[bareAgo[1]] ?? 1));

  // Yesterday, in its many spellings. "td malem" / "tadi malam" -> last night.
  if (/\b(tadi|td)\s*(malam|malem)\b/.test(t)) return at(shiftDays(-1), 20);
  if (/\bsemalam\b|\bsemalem\b/.test(t)) return at(shiftDays(-1), 20);
  if (/\bkemarin\s*(malam|malem)\b/.test(t)) return at(shiftDays(-1), 20);
  if (/\bkemaren\s*(malam|malem)\b/.test(t)) return at(shiftDays(-1), 20);
  if (/\bkemarin\s*(lusa)\b/.test(t)) return shiftDays(-2);
  if (/\bkemarin\b|\bkemaren\b/.test(t)) return shiftDays(-1);

  // Earlier today.
  if (/\b(tadi|td)\s*(pagi|siang|sore|subuh)\b/.test(t)) {
    const hour = /pagi/.test(t) ? 7 : /siang/.test(t) ? 12 : /sore/.test(t) ? 16 : 5;
    return at(new Date(now), hour);
  }
  if (/\bhari\s*ini\b/.test(t)) return new Date(now);
  if (/\b(barusan|baru\s*saja|baru\s*aja|tadi)\b/.test(t)) return new Date(now);

  // Future words parse fine — the caller warns about them.
  if (/\bbesok\s*(lusa)\b/.test(t)) return shiftDays(2);
  if (/\bbesok\b|\besok\b/.test(t)) return shiftDays(1);
  if (/\blusa\b/.test(t)) return shiftDays(2);

  return null;
}

/**
 * Accepts ISO, DD/MM/YYYY, DD-MM-YYYY and Indonesian relative terms.
 * Unparseable input yields null plus a warning; a future date parses
 * successfully but still warns, because a report about something that has not
 * happened yet is usually a typo and always worth a human look.
 */
export function normalizeDate(input: unknown, now: Date = new Date()): ParseResult<string> {
  if (input === null || input === undefined) return { value: null };

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      return { value: null, warning: "Tanggal kejadian tidak dapat dibaca." };
    }
    return withFutureCheck(input, input.toISOString(), now);
  }

  if (typeof input === "number") {
    // Epoch milliseconds, or epoch seconds for anything implausibly small.
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) {
      return { value: null, warning: `Tanggal kejadian "${input}" tidak dapat dibaca.` };
    }
    return withFutureCheck(d, String(input), now);
  }

  const text = stringify(input);
  if (text === null || text.trim() === "") return { value: null };
  const raw = text.trim();

  // DD/MM/YYYY or DD-MM-YYYY (and 2-digit years), optionally with a time.
  // The 4-digit year alternative must come first, or "2026" matches as "20".
  const dmy = raw.match(
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?:[\sT]+(\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/,
  );
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (dmy[3].length === 2) year += year < 70 ? 2000 : 1900;
    const hour = dmy[4] ? Number(dmy[4]) : 0;
    const minute = dmy[5] ? Number(dmy[5]) : 0;
    const second = dmy[6] ? Number(dmy[6]) : 0;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day, hour, minute, second);
      // Rejects impossible dates like 31/02 that Date would roll over.
      if (d.getMonth() === month - 1 && d.getDate() === day) {
        return withFutureCheck(d, raw, now);
      }
    }
    return { value: null, warning: `Tanggal kejadian "${raw}" tidak dapat dibaca.` };
  }

  // A bare ISO date carries no timezone. `new Date("2026-01-05")` would read it
  // as UTC midnight, which lands on the 4th for anyone west of Greenwich, so
  // build it from local components the way the DD/MM/YYYY branch does. A
  // reporter writing a date means that date where they are standing.
  const isoDateOnly = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1]);
    const month = Number(isoDateOnly[2]);
    const day = Number(isoDateOnly[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (d.getMonth() === month - 1 && d.getDate() === day) {
        return withFutureCheck(d, raw, now);
      }
    }
    return { value: null, warning: `Tanggal kejadian "${raw}" tidak dapat dibaca.` };
  }

  // Full ISO timestamps are absolute and parse as-is: 2026-02-11T20:30:00+07:00
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return withFutureCheck(d, raw, now);
    return { value: null, warning: `Tanggal kejadian "${raw}" tidak dapat dibaca.` };
  }

  const relative = parseRelativeIndonesian(raw, now);
  if (relative && !Number.isNaN(relative.getTime())) {
    return withFutureCheck(relative, raw, now);
  }

  // Last resort: whatever the platform can make of it.
  const loose = new Date(raw);
  if (!Number.isNaN(loose.getTime())) return withFutureCheck(loose, raw, now);

  return { value: null, warning: `Tanggal kejadian "${raw}" tidak dapat dibaca.` };
}

function withFutureCheck(date: Date, original: string, now: Date): ParseResult<string> {
  const iso = date.toISOString();
  if (date.getTime() > now.getTime()) {
    return {
      value: iso,
      warning: `Tanggal kejadian "${original}" berada di masa depan.`,
    };
  }
  return { value: iso };
}

// -------------------------------------------------------------------- number

/**
 * Magnitude words, anchored to a preceding digit so that "50rb" and "50 ribu"
 * both match. A bare `\b(rb|k)\b` would miss "50rb" entirely, because there is
 * no word boundary between a digit and a letter.
 */
const MULTIPLIERS: { pattern: RegExp; factor: number }[] = [
  { pattern: /\d\s*(miliar|milyar|milyard|billion|bio)\b/, factor: 1_000_000_000 },
  { pattern: /\d\s*(juta|jt|jutaan)\b/, factor: 1_000_000 },
  { pattern: /\d\s*(ribu|rb|ribuan|rban|k)\b/, factor: 1_000 },
];

/**
 * Parses money-ish and count-ish strings.
 *
 * Handles `Rp 100.000,-`, `50rb`, `2 juta`, `1,5jt`. A range takes its lower
 * bound and warns — understating an allegation is the safer direction.
 * Anything with no digits at all returns null so the caller can file the
 * original as free text instead.
 */
export function normalizeNumber(input: unknown): ParseResult<number> {
  if (input === null || input === undefined) return { value: null };

  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      return { value: null, warning: "Nilai numerik tidak valid." };
    }
    return { value: input };
  }

  if (typeof input === "boolean") {
    return { value: input ? 1 : 0, warning: "Nilai boolean dibaca sebagai angka." };
  }

  const text = stringify(input);
  if (text === null || text.trim() === "") return { value: null };
  const raw = text.trim();

  const lowered = raw.toLowerCase();

  // Strip currency markers and trailing bookkeeping dashes: "Rp 100.000,-"
  let work = lowered
    .replace(/\brp\.?\b/g, " ")
    .replace(/[,.]-\s*$/, " ")
    .replace(/\bidr\b/g, " ");

  if (!/\d/.test(work)) {
    return { value: null, warning: `Nilai "${raw}" bukan angka.` };
  }

  // Range: take the lower bound. Matches "50-100rb" and "50 sampai 100 ribu".
  let isRange = false;
  const rangeMatch = work.match(
    /(\d[\d.,\s]*)\s*(?:-|–|—|s\/d|sd|sampai|hingga|ke)\s*(\d[\d.,\s]*)/,
  );
  if (rangeMatch) {
    isRange = true;
    // Keep any trailing unit word ("rb") so it applies to the lower bound too.
    const tail = work.slice((rangeMatch.index ?? 0) + rangeMatch[0].length);
    work = `${rangeMatch[1]} ${tail}`;
  }

  let factor = 1;
  for (const { pattern, factor: f } of MULTIPLIERS) {
    if (pattern.test(work)) {
      factor = f;
      break;
    }
  }

  // Keep only the numeric core, then resolve Indonesian separators.
  const numeric = work.match(/\d[\d.,\s]*/)?.[0]?.replace(/\s/g, "") ?? "";
  if (numeric === "") {
    return { value: null, warning: `Nilai "${raw}" bukan angka.` };
  }

  const parsed = parseSeparators(numeric);
  if (parsed === null || !Number.isFinite(parsed)) {
    return { value: null, warning: `Nilai "${raw}" bukan angka.` };
  }

  const value = parsed * factor;

  if (isRange) {
    return { value, warning: `Nilai "${raw}" berupa rentang, dipakai batas bawah.` };
  }
  return { value };
}

/**
 * Resolves `.` and `,` under Indonesian conventions: `1.234.567,89` is a
 * million-and-a-bit, `1,5` is one and a half, `1.500` is fifteen hundred.
 */
function parseSeparators(numeric: string): number | null {
  const hasDot = numeric.includes(".");
  const hasComma = numeric.includes(",");

  if (hasDot && hasComma) {
    // Whichever appears last is the decimal mark.
    if (numeric.lastIndexOf(",") > numeric.lastIndexOf(".")) {
      return Number(numeric.replace(/\./g, "").replace(",", "."));
    }
    return Number(numeric.replace(/,/g, ""));
  }

  if (hasComma) {
    const parts = numeric.split(",");
    // "1,234,567" is a thousands-grouped number written the English way.
    if (parts.length > 2 && parts.slice(1).every((p) => p.length === 3)) {
      return Number(numeric.replace(/,/g, ""));
    }
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0) {
      // Genuinely ambiguous ("50,000"). Indonesian reading is the decimal one,
      // but a 3-digit tail of zeroes is almost always a thousands group.
      return /^0+$/.test(parts[1])
        ? Number(numeric.replace(",", ""))
        : Number(numeric.replace(",", "."));
    }
    return Number(numeric.replace(",", "."));
  }

  if (hasDot) {
    const parts = numeric.split(".");
    // Every group after the first being 3 digits means it is a separator.
    if (parts.length > 1 && parts.slice(1).every((p) => p.length === 3)) {
      return Number(numeric.replace(/\./g, ""));
    }
    return Number(numeric);
  }

  return Number(numeric);
}

/** Same as normalizeNumber but rounded, for count columns. */
export function normalizeInteger(input: unknown): ParseResult<number> {
  const result = normalizeNumber(input);
  if (result.value === null) return result;
  return { value: Math.round(result.value), warning: result.warning };
}

// ------------------------------------------------------------------- boolean

export function normalizeBoolean(input: unknown): ParseResult<boolean> {
  if (input === null || input === undefined) return { value: null };
  if (typeof input === "boolean") return { value: input };
  if (typeof input === "number") return { value: input !== 0 };

  const text = stringify(input);
  if (text === null || text.trim() === "") return { value: null };

  const t = flatten(text);
  if (TRUE_WORDS.includes(t)) return { value: true };
  if (FALSE_WORDS.includes(t)) return { value: false };

  // Phrases: "tidak ada bukti" reads false, "ada bukti foto" reads true.
  if (/\b(tidak|ga|gak|nggak|engga|enggak|bukan|belum|tanpa)\b/.test(t)) return { value: false };
  if (/\b(ya|iya|ada|sudah|benar|betul)\b/.test(t)) return { value: true };

  return { value: null, warning: `Nilai "${text}" tidak dapat dibaca sebagai ya/tidak.` };
}

// ------------------------------------------------------------------ priority

export function normalizePriority(input: unknown): ParseResult<Priority> {
  if (input === null || input === undefined) return { value: null };

  const text = stringify(input);
  if (text === null || text.trim() === "") return { value: null };

  const t = flatten(text);
  if (t === "normal" || t === "biasa" || t === "rendah" || t === "low") {
    return { value: "normal" };
  }
  if (URGENT_KEYWORDS.some((k) => t.includes(flatten(k)))) {
    return { value: "urgent" };
  }
  return {
    value: "normal",
    warning: `Prioritas "${text}" tidak dikenali, dipakai 'normal'.`,
  };
}

// ----------------------------------------------------------------- sanitising

/**
 * Recursively removes keys that look like national identity or financial
 * account numbers. Applied to the payload *before* it is stored, so the raw
 * copy never carries a NIK either.
 */
export function stripSensitive(value: unknown, warnings: string[], seen = new WeakSet()): Json {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    return value.map((item) => stripSensitive(item, warnings, seen));
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    const out: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        const warning = `Data identitas sensitif ditolak: ${key}`;
        if (!warnings.includes(warning)) warnings.push(warning);
        continue;
      }
      out[key] = stripSensitive(item, warnings, seen);
    }
    return out;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  // Functions, symbols, bigints: keep a readable trace rather than dropping.
  return stringify(value);
}

// -------------------------------------------------------------------- report

/** Columns normalizeReport knows how to fill. Everything else goes to `extra`. */
const TEXT_FIELDS = [
  "narrative",
  "incident_at_text",
  "location_text",
  "desa",
  "kecamatan",
  "kabupaten",
  "provinsi",
  "reported_party",
  "reported_party_role",
  "item_given",
  "item_value_text",
  "evidence_note",
  "reporter_name",
  "reporter_address",
  "reporter_contact",
  "raw_transcript",
] as const;

const INTEGER_FIELDS = ["recipients_estimate", "witness_count"] as const;
const BOOLEAN_FIELDS = ["identity_disclosed", "has_evidence"] as const;

/** Keys consumed by a mapper above, so they must not be duplicated into `extra`. */
const CONSUMED_KEYS = new Set<string>([
  ...TEXT_FIELDS,
  ...INTEGER_FIELDS,
  ...BOOLEAN_FIELDS,
  "incident_at",
  "category",
  "category_raw",
  "item_value",
  "priority",
]);

export type NormalizedReport = { row: ReportInsert; warnings: string[] };

/**
 * Turns an arbitrary intake payload into an insertable row.
 *
 * Never throws. If something goes genuinely wrong the payload is still filed as
 * a raw transcript, because an unreadable report on the desk beats no report.
 */
export function normalizeReport(payload: unknown, now: Date = new Date()): NormalizedReport {
  const warnings: string[] = [];

  try {
    // Sanitise first: nothing downstream, `payload` included, should ever see
    // a NIK or an account number.
    const safe = stripSensitive(payload, warnings);
    const source = isPlainObject(safe) ? safe : {};

    const row: ReportInsert = {
      payload: safe ?? {},
      extra: {},
      parse_warnings: [],
    };

    // ---- text -------------------------------------------------------------
    for (const field of TEXT_FIELDS) {
      if (!(field in source)) continue;
      const value = source[field];
      if (value === null || value === undefined) continue;

      if (isPlainObject(value) || Array.isArray(value)) {
        warnings.push(`Kolom "${field}" berisi data terstruktur, disimpan sebagai teks.`);
      }
      const text = stringify(value);
      if (text !== null && text.trim() !== "") {
        row[field] = text;
      }
    }

    // ---- integers ---------------------------------------------------------
    for (const field of INTEGER_FIELDS) {
      if (!(field in source)) continue;
      const { value, warning } = normalizeInteger(source[field]);
      if (warning) warnings.push(`${field}: ${warning}`);
      if (value !== null) row[field] = value;
    }

    // ---- booleans ---------------------------------------------------------
    for (const field of BOOLEAN_FIELDS) {
      if (!(field in source)) continue;
      const { value, warning } = normalizeBoolean(source[field]);
      if (warning) warnings.push(`${field}: ${warning}`);
      if (value !== null) row[field] = value;
    }

    // ---- money ------------------------------------------------------------
    if ("item_value" in source && source.item_value !== null && source.item_value !== undefined) {
      const { value, warning } = normalizeNumber(source.item_value);
      if (warning) warnings.push(`item_value: ${warning}`);
      if (value !== null) {
        row.item_value = value;
      } else {
        // Unparseable money keeps its words rather than vanishing.
        const text = stringify(source.item_value);
        if (text && text.trim() !== "" && !row.item_value_text) {
          row.item_value_text = text;
        }
      }
    }

    // ---- date -------------------------------------------------------------
    if ("incident_at" in source && source.incident_at !== null && source.incident_at !== undefined) {
      const { value, warning } = normalizeDate(source.incident_at, now);
      if (warning) warnings.push(warning);
      if (value !== null) row.incident_at = value;

      // The words the reporter actually used always survive.
      if (!row.incident_at_text) {
        const text = stringify(source.incident_at);
        if (text && text.trim() !== "") row.incident_at_text = text;
      }
    }

    // ---- category ---------------------------------------------------------
    if ("category" in source && source.category !== null && source.category !== undefined) {
      const rawText = stringify(source.category);
      if (rawText !== null && rawText.trim() !== "") {
        row.category_raw = rawText;
      }
      const { value, warning } = normalizeCategory(source.category);
      if (warning) warnings.push(warning);
      row.category = value ?? "lainnya";
    }
    // An explicit category_raw from the intake wins over the derived one.
    if ("category_raw" in source) {
      const rawText = stringify(source.category_raw);
      if (rawText !== null && rawText.trim() !== "") row.category_raw = rawText;
    }

    // ---- priority ---------------------------------------------------------
    if ("priority" in source && source.priority !== null && source.priority !== undefined) {
      const { value, warning } = normalizePriority(source.priority);
      if (warning) warnings.push(warning);
      if (value !== null) row.priority = value;
    }

    // ---- everything else --------------------------------------------------
    // This is the whole point of `extra`: an unrecognised key is a key we have
    // not learned about yet, not an error.
    const extra: Record<string, Json> = {};
    for (const [key, value] of Object.entries(source)) {
      if (CONSUMED_KEYS.has(key)) continue;
      extra[key] = (value ?? null) as Json;
    }
    if (Object.keys(extra).length > 0) row.extra = extra;

    row.parse_warnings = warnings;
    return { row, warnings };
  } catch (error) {
    // Belt and braces. If this ever fires it is a bug in the code above, and
    // the report still needs to land somewhere a human will see it.
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Normalisasi gagal, laporan disimpan mentah: ${message}`);

    let rawTranscript: string | null = null;
    try {
      rawTranscript = typeof payload === "string" ? payload : JSON.stringify(payload);
    } catch {
      rawTranscript = String(payload);
    }

    return {
      row: {
        raw_transcript: rawTranscript,
        payload: {},
        extra: {},
        parse_warnings: warnings,
      },
      warnings,
    };
  }
}
