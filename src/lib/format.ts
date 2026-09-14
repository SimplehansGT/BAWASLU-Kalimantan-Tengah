import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { id } from "date-fns/locale";

import {
  CATEGORY_LABELS,
  EMPTY_FIELD_TEXT,
  PRIORITY_LABELS,
  REPORT_CLASS_LABELS,
  STATUS_LABELS,
  type Category,
  type Priority,
  type ReportClass,
  type Status,
} from "@/lib/constants";

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : parseISO(value);
  return isValid(d) ? d : null;
}

/** `11 Feb 2026, 20:30` */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy, HH:mm", { locale: id }) : EMPTY_FIELD_TEXT;
}

/** `11 Feb 2026` */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy", { locale: id }) : EMPTY_FIELD_TEXT;
}

/** `3 hari lalu` */
export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return EMPTY_FIELD_TEXT;
  return `${formatDistanceToNowStrict(d, { locale: id })} lalu`;
}

/** `Rp 50.000` — no decimals, they are never meaningful for these amounts. */
export function formatRupiah(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return EMPTY_FIELD_TEXT;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return EMPTY_FIELD_TEXT;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  })
    .format(n)
    // Intl renders "Rp50.000"; the house style is a space after Rp.
    .replace(/^Rp\s?/, "Rp ");
}

/** `1.234` */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY_FIELD_TEXT;
  }
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

/** Hours as a readable duration: `4,5 jam` / `2 hari` */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return EMPTY_FIELD_TEXT;
  }
  if (hours < 1) return `${Math.round(hours * 60)} menit`;
  if (hours < 48) return `${hours.toFixed(1).replace(".", ",")} jam`;
  return `${(hours / 24).toFixed(1).replace(".", ",")} hari`;
}

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return CATEGORY_LABELS.lainnya;
  return CATEGORY_LABELS[value as Category] ?? value;
}

export function statusLabel(value: string | null | undefined): string {
  if (!value) return EMPTY_FIELD_TEXT;
  return STATUS_LABELS[value as Status] ?? value;
}

export function priorityLabel(value: string | null | undefined): string {
  if (!value) return EMPTY_FIELD_TEXT;
  return PRIORITY_LABELS[value as Priority] ?? value;
}

export function reportClassLabel(value: string | null | undefined): string {
  if (!value) return EMPTY_FIELD_TEXT;
  return REPORT_CLASS_LABELS[value as ReportClass] ?? value;
}

export function boolLabel(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return EMPTY_FIELD_TEXT;
  return value ? "Ya" : "Tidak";
}

/**
 * Renders any report field for the detail page. Empty stays visible as
 * `— belum diisi —` rather than being hidden, so a reviewer can see the gap.
 */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_FIELD_TEXT;
  if (typeof value === "boolean") return boolLabel(value);
  if (typeof value === "string") return value.trim() === "" ? EMPTY_FIELD_TEXT : value;
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

/** Tailwind classes per category badge. intimidasi_kekerasan is red by spec. */
export const CATEGORY_BADGE_CLASS: Record<string, string> = {
  politik_uang:
    "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
  penyalahgunaan_fasilitas:
    "bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900",
  intimidasi_kekerasan:
    "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900",
  pelanggaran_kampanye:
    "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900",
  pelanggaran_pemungutan:
    "bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-900",
  kode_etik:
    "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-200 dark:border-fuchsia-900",
  bukan_pelanggaran:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  lainnya:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export const STATUS_BADGE_CLASS: Record<string, string> = {
  baru: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900",
  ditinjau:
    "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
  diteruskan:
    "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-900",
  ditutup:
    "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
  bukan_pelanggaran:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  duplikat:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

/** Chart series colours, kept in one place so every chart reads as one system. */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

/**
 * Fixed colour per category, so a category keeps the same colour across every
 * chart on the page and between visits. intimidasi_kekerasan holds the red.
 */
export const CATEGORY_CHART_COLOR: Record<string, string> = {
  politik_uang: "var(--chart-3)",
  penyalahgunaan_fasilitas: "var(--chart-5)",
  intimidasi_kekerasan: "var(--chart-4)",
  pelanggaran_kampanye: "var(--chart-1)",
  pelanggaran_pemungutan: "var(--chart-2)",
  kode_etik: "var(--chart-7)",
  bukan_pelanggaran: "var(--chart-8)",
  lainnya: "var(--chart-8)",
};

export const STATUS_CHART_COLOR: Record<string, string> = {
  baru: "var(--chart-1)",
  ditinjau: "var(--chart-3)",
  diteruskan: "var(--chart-5)",
  ditutup: "var(--chart-2)",
  bukan_pelanggaran: "var(--chart-8)",
  duplikat: "var(--chart-8)",
};

export function categoryChartColor(key: string): string {
  return CATEGORY_CHART_COLOR[key] ?? "var(--chart-8)";
}

export function statusChartColor(key: string): string {
  return STATUS_CHART_COLOR[key] ?? "var(--chart-8)";
}
