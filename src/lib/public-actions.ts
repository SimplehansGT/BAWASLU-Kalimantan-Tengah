"use server";

import { headers } from "next/headers";

import { normalizeReport } from "@/lib/normalize";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The public intake path — the only server action reachable without a session.
 *
 * Deliberately write-only. It runs the service role client server-side rather
 * than handing the browser a database credential, so the `anon` role keeps
 * exactly zero grants and there is still no public read path of any kind. The
 * caller gets back a boolean, never a row, never a ticket, never an id.
 */

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_NARRATIVE_CHARS = 50_000;

/** Submissions per IP per window. Generous — a household may share an IP. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

/** A form completed faster than this was almost certainly not typed by hand. */
const MIN_FILL_MS = 3_000;

export type PublicSubmitResult = { ok: true } | { ok: false; error: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Magic-byte check. `file.type` is supplied by the client and can say anything,
 * so it is not evidence of what the bytes actually are.
 */
function looksLikeImage(bytes: Uint8Array): boolean {
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);

  if (startsWith([0xff, 0xd8, 0xff])) return true; // JPEG
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true; // PNG
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return true; // GIF
  // WEBP: "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return true;
  }
  // HEIC/HEIF: "ftyp" box at offset 4
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) return true;

  return false;
}

export async function submitPublicReportAction(
  formData: FormData,
): Promise<PublicSubmitResult> {
  // ---- honeypot ---------------------------------------------------------
  // A field hidden from people but visible to a form-filling bot. Answering
  // "ok" rather than an error is intentional: a bot told it failed simply
  // retries, whereas one told it succeeded moves on.
  const trap = String(formData.get("alamat_surel") ?? "");
  if (trap.trim() !== "") return { ok: true };

  // ---- minimum fill time ------------------------------------------------
  // Measured in the browser, so trivially forgeable — it is a speed bump for
  // naive automation, not a control. The honeypot and rate limit do the work.
  const elapsed = Number(formData.get("elapsed_ms") ?? 0);
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS) {
    return {
      ok: false,
      error: "Mohon lengkapi formulir terlebih dahulu, lalu kirim kembali.",
    };
  }

  // ---- rate limit -------------------------------------------------------
  const ip = await clientIp();
  const limit = rateLimit(`lapor-publik:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return {
      ok: false,
      error: `Terlalu banyak laporan dikirim dari jaringan ini. Coba lagi dalam ${minutes} menit.`,
    };
  }

  // ---- payload ----------------------------------------------------------
  let parsed: unknown;
  try {
    const raw = String(formData.get("payload") ?? "");
    parsed = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    return { ok: false, error: "Data formulir tidak dapat dibaca. Muat ulang halaman." };
  }

  const { row, warnings } = normalizeReport(parsed);

  const narrative = (row.narrative ?? "").trim();
  if (narrative === "") {
    return { ok: false, error: "Isi uraian kejadian minimal satu kalimat." };
  }
  if (narrative.length > MAX_NARRATIVE_CHARS) {
    return {
      ok: false,
      error: "Uraian kejadian terlalu panjang. Ringkas menjadi bagian yang paling penting.",
    };
  }

  row.source = "web";
  row.source_meta = {
    channel: "form_publik",
    ip,
    user_agent: (await headers()).get("user-agent") ?? null,
    received_at: new Date().toISOString(),
  };

  // ---- files ------------------------------------------------------------
  // Validated before the row is written, so a rejected file does not leave a
  // half-finished report behind.
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_FILES);

  const verified: { file: File; bytes: Uint8Array }[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `Berkas "${file.name}" melebihi 5 MB. Perkecil ukurannya lalu coba lagi.`,
      };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeImage(bytes)) {
      return {
        ok: false,
        error: `Berkas "${file.name}" bukan gambar yang dikenali. Unggah foto berformat JPG, PNG, atau HEIC.`,
      };
    }
    verified.push({ file, bytes });
  }

  if (verified.length > 0) row.has_evidence = true;

  // ---- persist ----------------------------------------------------------
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("reports")
      .insert(row)
      .select("id")
      .single();

    if (error || !data) {
      console.error("[lapor-publik] gagal menyimpan laporan", error);
      return {
        ok: false,
        error: "Laporan gagal tersimpan karena gangguan sistem. Mohon coba lagi sesaat lagi.",
      };
    }

    await supabase.from("report_events").insert({
      report_id: data.id,
      actor_id: null,
      event_type: "created",
      to_value: "baru",
      detail: { source: "form_publik", warnings },
    });

    for (const { file, bytes } of verified) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const path = `${data.id}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("report-attachments")
        .upload(path, bytes, { contentType: file.type || "image/jpeg", upsert: false });

      if (uploadError) {
        // The report itself is already safe. A lost photo is worth a log line,
        // not a failure the reporter has to deal with.
        console.error("[lapor-publik] gagal mengunggah lampiran", uploadError);
        continue;
      }

      await supabase.from("attachments").insert({
        report_id: data.id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("[lapor-publik] kesalahan tak terduga", error);
    return {
      ok: false,
      error: "Laporan gagal tersimpan karena gangguan sistem. Mohon coba lagi sesaat lagi.",
    };
  }
}
