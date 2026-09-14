import "server-only";

import { COMPLETENESS_FIELDS, OPEN_STATUSES, PAGE_SIZE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { AttachmentRow, ReportEventRow, ReportRow } from "@/types/database";

/**
 * Every read the app performs. All of them go through the *user's* client, so
 * RLS applies — there is no read path that bypasses it.
 */

export type ReportFilters = {
  from?: string;
  to?: string;
  kabupaten?: string;
  kecamatan?: string;
  category?: string;
  status?: string;
  priority?: string;
  identityDisclosed?: boolean;
  hasEvidence?: boolean;
  q?: string;
  includeArchived?: boolean;
};

/**
 * PostgREST's `or()` takes a comma-separated filter string, so a comma or
 * parenthesis in user input would change the query's shape. Strip them.
 */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()"\\*]/g, " ").trim().slice(0, 200);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function applyFilters(query: any, filters: ReportFilters) {
  if (!filters.includeArchived) query = query.eq("is_archived", false);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  if (filters.kabupaten) query = query.eq("kabupaten", filters.kabupaten);
  if (filters.kecamatan) query = query.eq("kecamatan", filters.kecamatan);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.identityDisclosed !== undefined) {
    query = query.eq("identity_disclosed", filters.identityDisclosed);
  }
  if (filters.hasEvidence !== undefined) {
    query = query.eq("has_evidence", filters.hasEvidence);
  }

  if (filters.q) {
    const q = sanitizeSearch(filters.q);
    if (q) {
      // Substring search across the free-text columns. The migration's GIN
      // index covers an expression PostgREST cannot target directly; at the
      // volume one province produces this is comfortably fast, but it is the
      // first thing to revisit if the table ever gets large.
      query = query.or(
        [
          `narrative.ilike.%${q}%`,
          `location_text.ilike.%${q}%`,
          `reported_party.ilike.%${q}%`,
          `ticket.ilike.%${q}%`,
          `raw_transcript.ilike.%${q}%`,
        ].join(","),
      );
    }
  }

  return query;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ReportListResult = {
  rows: ReportRow[];
  total: number;
  page: number;
  pageCount: number;
  error: string | null;
};

export async function getReports(
  filters: ReportFilters = {},
  page = 1,
  pageSize = PAGE_SIZE,
): Promise<ReportListResult> {
  const supabase = await createClient();

  const safePage = Math.max(1, Math.floor(page) || 1);
  const fromIndex = (safePage - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  let query = supabase.from("reports").select("*", { count: "exact" });
  query = applyFilters(query, filters);

  // 'urgent' sorts after 'normal' alphabetically, so descending puts urgent
  // rows on top — which is the required default ordering.
  const { data, count, error } = await query
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromIndex, toIndex);

  if (error) {
    return { rows: [], total: 0, page: safePage, pageCount: 0, error: error.message };
  }

  const total = count ?? 0;
  return {
    rows: (data ?? []) as ReportRow[],
    total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    error: null,
  };
}

/** Unpaginated projection for CSV export. Capped so an export cannot hang. */
export async function getReportsForExport(
  filters: ReportFilters = {},
  cap = 5000,
): Promise<ReportRow[]> {
  const supabase = await createClient();
  let query = supabase.from("reports").select("*");
  query = applyFilters(query, filters);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) return [];
  return (data ?? []) as ReportRow[];
}

export type ReportDetail = {
  report: ReportRow;
  attachments: AttachmentRow[];
  events: (ReportEventRow & { actor_username: string | null })[];
};

export async function getReport(id: string): Promise<ReportDetail | null> {
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !report) return null;

  const [{ data: attachments }, { data: events }] = await Promise.all([
    supabase
      .from("attachments")
      .select("*")
      .eq("report_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("report_events")
      .select("*")
      .eq("report_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Resolve actor usernames in one round trip rather than per row.
  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean))] as string[];
  const usernames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", actorIds);
    for (const p of profiles ?? []) usernames.set(p.id, p.username);
  }

  return {
    report: report as ReportRow,
    attachments: (attachments ?? []) as AttachmentRow[],
    events: ((events ?? []) as ReportEventRow[]).map((e) => ({
      ...e,
      actor_username: e.actor_id ? (usernames.get(e.actor_id) ?? null) : null,
    })),
  };
}

/** Short-lived signed URLs. Attachments are never publicly readable. */
export async function getSignedAttachmentUrls(
  paths: string[],
  expiresIn = 60,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("report-attachments")
    .createSignedUrls(paths, expiresIn);

  if (error || !data) return result;

  for (const item of data) {
    if (item.signedUrl && item.path) result.set(item.path, item.signedUrl);
  }
  return result;
}

// ---------------------------------------------------------------- analytics

/**
 * Columns the dashboard aggregates over. Kept narrow so pulling the filtered
 * set into memory stays cheap.
 */
const ANALYTICS_COLUMNS =
  "id, created_at, updated_at, status, priority, report_class, category, kecamatan, kabupaten, " +
  "incident_at, incident_at_text, reported_party, item_value, identity_disclosed, has_evidence, " +
  "reporter_name, narrative, completeness";

export type AnalyticsRow = Pick<
  ReportRow,
  | "id"
  | "created_at"
  | "updated_at"
  | "status"
  | "priority"
  | "report_class"
  | "category"
  | "kecamatan"
  | "kabupaten"
  | "incident_at"
  | "incident_at_text"
  | "reported_party"
  | "item_value"
  | "identity_disclosed"
  | "has_evidence"
  | "reporter_name"
  | "narrative"
  | "completeness"
>;

/**
 * Aggregation happens in JS over the filtered projection rather than in SQL.
 *
 * One province produces reports in the thousands, not the millions, and doing
 * it here keeps every number on the dashboard defined in one readable place
 * instead of spread across a dozen RPCs. `cap` is the safety valve; if it is
 * ever hit, the honest fix is materialised views, not a bigger cap.
 */
export async function getAnalyticsRows(
  filters: ReportFilters = {},
  cap = 10000,
): Promise<{ rows: AnalyticsRow[]; capped: boolean }> {
  const supabase = await createClient();

  let query = supabase.from("reports").select(ANALYTICS_COLUMNS);
  query = applyFilters(query, filters);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(cap);

  if (error || !data) return { rows: [], capped: false };
  return { rows: data as unknown as AnalyticsRow[], capped: data.length >= cap };
}

/** Median of a numeric list. Returns null for an empty list rather than 0. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type DashboardStats = {
  total: number;
  unreviewed: number;
  urgentOpen: number;
  laporanCount: number;
  informasiAwalCount: number;
  avgCompleteness: number;
  last7Days: number;
  capped: boolean;
};

export function computeStats(rows: AnalyticsRow[], capped: boolean): DashboardStats {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  let unreviewed = 0;
  let urgentOpen = 0;
  let laporanCount = 0;
  let informasiAwalCount = 0;
  let completenessSum = 0;
  let last7Days = 0;

  for (const r of rows) {
    if (r.status === "baru") unreviewed += 1;
    if (r.priority === "urgent" && OPEN_STATUSES.includes(r.status as never)) urgentOpen += 1;
    if (r.report_class === "laporan") laporanCount += 1;
    else informasiAwalCount += 1;
    completenessSum += r.completeness ?? 0;
    if (new Date(r.created_at).getTime() >= sevenDaysAgo) last7Days += 1;
  }

  return {
    total: rows.length,
    unreviewed,
    urgentOpen,
    laporanCount,
    informasiAwalCount,
    avgCompleteness: rows.length === 0 ? 0 : completenessSum / rows.length,
    last7Days,
    capped,
  };
}

export type DailyPoint = { date: string; total: number; urgent: number };

/** Reports per day for the last N days. Days with no reports stay in, as zeroes. */
export function computeDaily(rows: AnalyticsRow[], days = 30): DailyPoint[] {
  const buckets = new Map<string, DailyPoint>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    buckets.set(key, { date: key, total: 0, urgent: 0 });
  }

  for (const r of rows) {
    const key = localDayKey(new Date(r.created_at));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (r.priority === "urgent") bucket.urgent += 1;
  }

  return [...buckets.values()];
}

function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type CountPoint = { key: string; label: string; count: number };

export function computeCountsBy(
  rows: AnalyticsRow[],
  field: keyof AnalyticsRow,
  labeller: (key: string) => string,
  limit?: number,
): CountPoint[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const raw = r[field];
    const key = raw === null || raw === undefined || raw === "" ? "lainnya" : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points = [...counts.entries()]
    .map(([key, count]) => ({ key, label: labeller(key), count }))
    .sort((a, b) => b.count - a.count);

  return limit ? points.slice(0, limit) : points;
}

export type StackedPoint = { key: string; label: string; disclosed: number; anonymous: number };

export function computeIdentityByCategory(
  rows: AnalyticsRow[],
  labeller: (key: string) => string,
): StackedPoint[] {
  const map = new Map<string, StackedPoint>();

  for (const r of rows) {
    const key = r.category ?? "lainnya";
    const entry = map.get(key) ?? { key, label: labeller(key), disclosed: 0, anonymous: 0 };
    if (r.identity_disclosed) entry.disclosed += 1;
    else entry.anonymous += 1;
    map.set(key, entry);
  }

  return [...map.values()].sort((a, b) => b.disclosed + b.anonymous - (a.disclosed + a.anonymous));
}

export type ReportedPartyPoint = { name: string; count: number };

/**
 * Most frequently named parties.
 *
 * Grouping is on a loosely normalised name, because "Pak Budi" and "pak budi "
 * are the same allegation. Everything this returns is unverified accusation —
 * the panel that renders it is required to say so.
 */
export function computeTopReportedParties(rows: AnalyticsRow[], limit = 10): ReportedPartyPoint[] {
  const counts = new Map<string, { display: string; count: number }>();

  for (const r of rows) {
    const raw = (r.reported_party ?? "").trim();
    if (raw === "") continue;
    const key = raw.toLowerCase().replace(/\s+/g, " ");
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { display: raw, count: 1 });
  }

  return [...counts.values()]
    .map((v) => ({ name: v.display, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type ValueEstimate = {
  sum: number;
  median: number | null;
  withValue: number;
  withoutValue: number;
};

/**
 * Money-politics value estimate.
 *
 * `withoutValue` is returned alongside the sum and is not optional: a total of
 * "Rp 4.000.000" means something very different when 8 of 90 reports carried a
 * figure. The UI must show both.
 */
export function computeValueEstimate(rows: AnalyticsRow[]): ValueEstimate {
  const relevant = rows.filter((r) => r.category === "politik_uang");
  const values: number[] = [];
  let withoutValue = 0;

  for (const r of relevant) {
    const v = r.item_value;
    if (v === null || v === undefined || !Number.isFinite(Number(v))) withoutValue += 1;
    else values.push(Number(v));
  }

  return {
    sum: values.reduce((acc, v) => acc + v, 0),
    median: median(values),
    withValue: values.length,
    withoutValue,
  };
}

export type QualityReport = {
  distribution: { bucket: string; count: number }[];
  missing: { key: string; label: string; count: number }[];
};

export function computeQuality(rows: AnalyticsRow[]): QualityReport {
  const buckets = [
    { bucket: "0-24", count: 0 },
    { bucket: "25-49", count: 0 },
    { bucket: "50-74", count: 0 },
    { bucket: "75-100", count: 0 },
  ];

  for (const r of rows) {
    const c = r.completeness ?? 0;
    if (c < 25) buckets[0].count += 1;
    else if (c < 50) buckets[1].count += 1;
    else if (c < 75) buckets[2].count += 1;
    else buckets[3].count += 1;
  }

  const missing = COMPLETENESS_FIELDS.map((field) => {
    let count = 0;
    for (const r of rows) {
      const value = r[field.key as keyof AnalyticsRow];
      const isEmpty =
        value === null ||
        value === undefined ||
        value === "" ||
        (field.key === "has_evidence" && value === false);
      if (isEmpty) count += 1;
    }
    return { ...field, count };
  }).sort((a, b) => b.count - a.count);

  return { distribution: buckets, missing };
}

/**
 * Median hours from a report arriving to its first status change.
 *
 * Uses report_events rather than `updated_at`, because a note or an inline edit
 * also bumps `updated_at` and would flatter the number.
 */
export async function getResponseTime(filters: ReportFilters = {}): Promise<{
  medianHours: number | null;
  measured: number;
  pending: number;
}> {
  const supabase = await createClient();

  let query = supabase.from("reports").select("id, created_at, status");
  query = applyFilters(query, filters);
  const { data: reports, error } = await query.limit(5000);

  if (error || !reports || reports.length === 0) {
    return { medianHours: null, measured: 0, pending: 0 };
  }

  const ids = reports.map((r) => r.id);
  const createdAt = new Map(reports.map((r) => [r.id, new Date(r.created_at).getTime()]));

  const { data: events } = await supabase
    .from("report_events")
    .select("report_id, created_at, event_type")
    .in("report_id", ids)
    .eq("event_type", "status_changed")
    .order("created_at", { ascending: true });

  const firstChange = new Map<string, number>();
  for (const e of events ?? []) {
    if (!firstChange.has(e.report_id)) {
      firstChange.set(e.report_id, new Date(e.created_at).getTime());
    }
  }

  const hours: number[] = [];
  for (const [id, created] of createdAt) {
    const changed = firstChange.get(id);
    if (changed !== undefined && changed >= created) {
      hours.push((changed - created) / 3_600_000);
    }
  }

  return {
    medianHours: median(hours),
    measured: hours.length,
    pending: reports.length - hours.length,
  };
}

/** Distinct values for the filter dropdowns. */
export async function getFilterOptions(): Promise<{
  kabupaten: string[];
  kecamatan: string[];
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reports")
    .select("kabupaten, kecamatan")
    .eq("is_archived", false)
    .limit(10000);

  if (error || !data) return { kabupaten: [], kecamatan: [] };

  const kabupaten = new Set<string>();
  const kecamatan = new Set<string>();
  for (const row of data) {
    if (row.kabupaten?.trim()) kabupaten.add(row.kabupaten.trim());
    if (row.kecamatan?.trim()) kecamatan.add(row.kecamatan.trim());
  }

  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "id"));
  return { kabupaten: sort(kabupaten), kecamatan: sort(kecamatan) };
}

export async function getProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return [];
  return data ?? [];
}
