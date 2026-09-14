import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { normalizeReport } from "@/lib/normalize";
import { rateLimit } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ingest endpoint for the AI intake bot.
 *
 * Built now, wired to nothing (HARD CONSTRAINT 7). The contract it promises the
 * bot is unusual and deliberate: *any* body that gets past the shared secret
 * results in a stored row and a 200. There is no 400 for bad content, because a
 * rejected report is a lost report, and the bot on the other end has no way to
 * ask the citizen to rephrase. Only a genuine database failure returns 500.
 */

/** Compares secrets in constant time, via digests so length never leaks. */
function secretMatches(provided: string, expected: string): boolean {
  if (!expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  // ---- rate limit ---------------------------------------------------------
  const limit = rateLimit(`intake:${clientIp(request)}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi nanti." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    );
  }

  // ---- shared secret ------------------------------------------------------
  const provided = request.headers.get("x-intake-secret") ?? "";
  if (!secretMatches(provided, serverEnv.intakeSecret)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  // ---- body ---------------------------------------------------------------
  // Read as text first. If it is not JSON at all, it still becomes a report:
  // the raw text is the transcript and a human can read it later.
  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    bodyText = "";
  }

  let parsed: unknown;
  let parseFailed = false;
  try {
    parsed = bodyText.trim() === "" ? {} : JSON.parse(bodyText);
  } catch {
    parseFailed = true;
    parsed = {};
  }

  // ---- normalise ----------------------------------------------------------
  const { row, warnings } = normalizeReport(parsed);

  if (parseFailed) {
    row.raw_transcript = bodyText;
    warnings.push("Body bukan JSON yang valid, disimpan sebagai teks mentah.");
    row.parse_warnings = warnings;
  }

  // Nothing readable at all still gets filed rather than dropped.
  if (!row.narrative && !row.raw_transcript) {
    row.raw_transcript = bodyText;
  }

  row.source = "api";
  row.source_meta = {
    ip: clientIp(request),
    user_agent: request.headers.get("user-agent") ?? null,
    received_at: new Date().toISOString(),
  };

  // ---- persist ------------------------------------------------------------
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("reports")
      .insert(row)
      .select("id, ticket")
      .single();

    if (error || !data) {
      console.error("[api/reports] gagal menyimpan laporan", error);
      return NextResponse.json(
        { error: "Gagal menyimpan laporan.", detail: error?.message ?? null },
        { status: 500 },
      );
    }

    // Audit trail. A failure here must not lose the report that was just
    // written, so it is logged and swallowed.
    const { error: eventError } = await supabase.from("report_events").insert({
      report_id: data.id,
      actor_id: null,
      event_type: "created",
      to_value: "baru",
      detail: { source: "api", warnings },
    });
    if (eventError) {
      console.error("[api/reports] gagal menulis audit event", eventError);
    }

    return NextResponse.json({ ticket: data.ticket, id: data.id, warnings }, { status: 200 });
  } catch (error) {
    console.error("[api/reports] kesalahan tak terduga", error);
    return NextResponse.json(
      {
        error: "Gagal menyimpan laporan.",
        detail: error instanceof Error ? error.message : null,
      },
      { status: 500 },
    );
  }
}

/** POST only — everything else is a deliberate 405. */
export async function GET() {
  return NextResponse.json(
    { error: "Gunakan POST untuk mengirim laporan." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
