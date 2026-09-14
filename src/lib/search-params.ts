import type { ReportFilters } from "@/lib/queries";

/**
 * Filters live in the URL so a view can be shared, bookmarked and reloaded.
 * This is the single place that translates between the two representations.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function bool(value: string | undefined): boolean | undefined {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}

export function parseFilters(params: RawSearchParams): ReportFilters {
  const from = first(params.from);
  const to = first(params.to);

  return {
    // A bare date means the whole of that day in the viewer's terms; the `to`
    // bound is pushed to the end of the day so "1 Feb to 1 Feb" is not empty.
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    kabupaten: first(params.kabupaten) || undefined,
    kecamatan: first(params.kecamatan) || undefined,
    category: first(params.category) || undefined,
    status: first(params.status) || undefined,
    priority: first(params.priority) || undefined,
    identityDisclosed: bool(first(params.identitas)),
    hasEvidence: bool(first(params.bukti)),
    q: first(params.q) || undefined,
    includeArchived: bool(first(params.arsip)) ?? false,
  };
}

export function parsePage(params: RawSearchParams): number {
  const raw = Number(first(params.page) ?? 1);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

/** The filter keys, for building links that preserve or clear them. */
export const FILTER_KEYS = [
  "from",
  "to",
  "kabupaten",
  "kecamatan",
  "category",
  "status",
  "priority",
  "identitas",
  "bukti",
  "q",
  "arsip",
] as const;

export function hasAnyFilter(params: RawSearchParams): boolean {
  return FILTER_KEYS.some((key) => {
    const value = first(params[key]);
    return value !== undefined && value !== "";
  });
}

export function buildQueryString(params: RawSearchParams, overrides: Record<string, string | null>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const v = first(value);
    if (v) search.set(key, v);
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === "") search.delete(key);
    else search.set(key, value);
  }

  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
