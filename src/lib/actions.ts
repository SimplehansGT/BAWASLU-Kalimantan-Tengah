"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser, isValidUsername, normalizeUsername, usernameToEmail } from "@/lib/auth";
import { PRIORITIES, STATUSES, type Priority, type Status } from "@/lib/constants";
import { publicEnv } from "@/lib/env";
import { normalizeReport } from "@/lib/normalize";
import { generatePassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json, ReportInsert, ReportUpdate } from "@/types/database";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// ============================================================ authentication

export type LoginState = { error: string | null };

/**
 * Username + password login.
 *
 * The failure message is deliberately identical whether the username does not
 * exist, the password is wrong, or the account is deactivated. Anything more
 * specific turns the login form into a way to enumerate who works here.
 */
export async function signInAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!username.trim() || !password) {
    return { error: "Nama pengguna atau kata sandi salah." };
  }

  // A missing Supabase config makes createServerClient throw, which surfaces as
  // an opaque "server-side exception" page. Catch it here and say what is
  // actually wrong — a deployment misconfiguration is not a login failure, and
  // pretending otherwise sends whoever is debugging down the wrong path.
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    console.error(
      "[auth] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY kosong saat runtime. " +
        "Keduanya di-inline saat build, jadi pastikan keduanya tersedia pada build " +
        "(di Vercel: variabel biasa, bukan Sensitive) lalu deploy ulang tanpa build cache.",
    );
    return {
      error:
        "Konfigurasi server belum lengkap sehingga login tidak dapat diproses. " +
        "Hubungi administrator teknis.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error || !data.user) {
    return { error: "Nama pengguna atau kata sandi salah." };
  }

  // A deactivated account must not get a usable session.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "Nama pengguna atau kata sandi salah." };
  }

  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(target);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ================================================================== reports

async function writeEvent(
  reportId: string,
  actorId: string | null,
  eventType: string,
  fromValue: string | null,
  toValue: string | null,
  detail: Json = {},
) {
  const supabase = await createClient();
  const { error } = await supabase.from("report_events").insert({
    report_id: reportId,
    actor_id: actorId,
    event_type: eventType,
    from_value: fromValue,
    to_value: toValue,
    detail,
  });
  // An audit write failing must not roll back the change the user just made,
  // but it must be visible in the logs.
  if (error) console.error("[actions] gagal menulis audit event", error);
}

export type CreateReportResult = { id: string; ticket: string; warnings: string[] };

/**
 * Manual intake from /reports/new.
 *
 * The narrative is the only required field, matching the AI path: a report with
 * nothing but one line of text is still a report.
 */
export async function createReportAction(
  formData: FormData,
): Promise<ActionResult<CreateReportResult>> {
  const user = await getSessionUser();
  if (!user) return fail("Sesi berakhir. Silakan masuk kembali.");

  const rawPayload = String(formData.get("payload") ?? "");
  const sourceLabel = String(formData.get("source") ?? "manual");

  let parsed: unknown;
  try {
    parsed = rawPayload.trim() === "" ? {} : JSON.parse(rawPayload);
  } catch {
    return fail("Data formulir tidak dapat dibaca.");
  }

  const { row, warnings } = normalizeReport(parsed);

  const narrative = (row.narrative ?? "").trim();
  const transcript = (row.raw_transcript ?? "").trim();
  if (narrative === "" && transcript === "") {
    return fail("Isi uraian kejadian minimal satu kalimat.");
  }

  const insert: ReportInsert = {
    ...row,
    source: sourceLabel === "json" ? "manual" : "manual",
    source_meta: {
      entered_by: user.profile?.username ?? user.id,
      entry_mode: sourceLabel,
      entered_at: new Date().toISOString(),
    },
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .insert(insert)
    .select("id, ticket")
    .single();

  if (error || !data) {
    return fail(`Gagal menyimpan laporan: ${error?.message ?? "kesalahan tidak diketahui"}`);
  }

  await writeEvent(data.id, user.id, "created", null, "baru", {
    source: "manual",
    warnings,
  });

  // Attachments, if any. A failed upload is reported but does not discard the
  // report that was just written.
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const uploadWarnings: string[] = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `${data.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("report-attachments")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      uploadWarnings.push(`Gagal mengunggah ${file.name}: ${uploadError.message}`);
      continue;
    }

    const { error: attachError } = await supabase.from("attachments").insert({
      report_id: data.id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    });
    if (attachError) uploadWarnings.push(`Gagal mencatat ${file.name}: ${attachError.message}`);
  }

  revalidatePath("/reports");
  revalidatePath("/");

  return {
    ok: true,
    data: { id: data.id, ticket: data.ticket, warnings: [...warnings, ...uploadWarnings] },
  };
}

export async function updateStatusAction(
  reportId: string,
  status: string,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("Sesi berakhir. Silakan masuk kembali.");

  if (!STATUSES.includes(status as Status)) return fail("Status tidak dikenali.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("reports")
    .select("status")
    .eq("id", reportId)
    .maybeSingle();

  if (!current) return fail("Laporan tidak ditemukan.");
  if (current.status === status) return { ok: true };

  const { error } = await supabase
    .from("reports")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) return fail(`Gagal memperbarui status: ${error.message}`);

  await writeEvent(reportId, user.id, "status_changed", current.status, status);

  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
  revalidatePath("/");
  return { ok: true };
}

export async function updatePriorityAction(
  reportId: string,
  priority: string,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("Sesi berakhir. Silakan masuk kembali.");

  if (!PRIORITIES.includes(priority as Priority)) return fail("Prioritas tidak dikenali.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("reports")
    .select("priority")
    .eq("id", reportId)
    .maybeSingle();

  if (!current) return fail("Laporan tidak ditemukan.");
  if (current.priority === priority) return { ok: true };

  const { error } = await supabase.from("reports").update({ priority }).eq("id", reportId);
  if (error) return fail(`Gagal memperbarui prioritas: ${error.message}`);

  await writeEvent(reportId, user.id, "priority_changed", current.priority, priority);

  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
  revalidatePath("/");
  return { ok: true };
}

export async function updateNotesAction(
  reportId: string,
  notes: string,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("Sesi berakhir. Silakan masuk kembali.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("reports")
    .select("admin_notes")
    .eq("id", reportId)
    .maybeSingle();

  if (!current) return fail("Laporan tidak ditemukan.");
  if ((current.admin_notes ?? "") === notes) return { ok: true };

  const { error } = await supabase
    .from("reports")
    .update({ admin_notes: notes })
    .eq("id", reportId);

  if (error) return fail(`Gagal menyimpan catatan: ${error.message}`);

  await writeEvent(reportId, user.id, "note_added", current.admin_notes, notes);

  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

/** Fields an admin may edit inline on the detail page. */
const EDITABLE_TEXT_FIELDS = new Set([
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
  "category",
]);

const EDITABLE_NUMBER_FIELDS = new Set(["item_value", "recipients_estimate", "witness_count"]);
const EDITABLE_BOOLEAN_FIELDS = new Set(["identity_disclosed", "has_evidence"]);

export async function updateFieldAction(
  reportId: string,
  field: string,
  value: string,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return fail("Sesi berakhir. Silakan masuk kembali.");
  if (user.profile?.role !== "admin") return fail("Hanya admin yang dapat mengubah isi laporan.");

  const isText = EDITABLE_TEXT_FIELDS.has(field);
  const isNumber = EDITABLE_NUMBER_FIELDS.has(field);
  const isBoolean = EDITABLE_BOOLEAN_FIELDS.has(field);

  if (!isText && !isNumber && !isBoolean) return fail("Kolom tidak dapat diubah.");

  const supabase = await createClient();
  // Selecting the whole row rather than a dynamic column name: the typed client
  // cannot narrow a runtime string, and the field is whitelisted above anyway.
  const { data: current } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (!current) return fail("Laporan tidak ditemukan.");

  const previous = (current as unknown as Record<string, unknown>)[field];

  let nextValue: string | number | boolean | null;
  if (isNumber) {
    const trimmed = value.trim();
    nextValue = trimmed === "" ? null : Number(trimmed);
    if (nextValue !== null && !Number.isFinite(nextValue)) return fail("Nilai harus berupa angka.");
  } else if (isBoolean) {
    nextValue = value === "true";
  } else {
    nextValue = value.trim() === "" ? null : value;
  }

  if (String(previous ?? "") === String(nextValue ?? "")) return { ok: true };

  // A computed key cannot be checked against the row type; the whitelist above
  // is what guarantees `field` is a real, editable column.
  const patch = { [field]: nextValue } as ReportUpdate;

  const { error } = await supabase.from("reports").update(patch).eq("id", reportId);

  if (error) return fail(`Gagal menyimpan perubahan: ${error.message}`);

  await writeEvent(
    reportId,
    user.id,
    "edited",
    previous === null || previous === undefined ? null : String(previous),
    nextValue === null ? null : String(nextValue),
    { field },
  );

  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
  return { ok: true };
}

export async function bulkUpdateStatusAction(
  reportIds: string[],
  status: string,
): Promise<ActionResult<{ updated: number }>> {
  const user = await getSessionUser();
  if (!user) return fail("Sesi berakhir. Silakan masuk kembali.");
  if (!STATUSES.includes(status as Status)) return fail("Status tidak dikenali.");
  if (reportIds.length === 0) return fail("Tidak ada laporan yang dipilih.");

  const supabase = await createClient();
  const { data: currents } = await supabase
    .from("reports")
    .select("id, status")
    .in("id", reportIds);

  const { error } = await supabase
    .from("reports")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .in("id", reportIds);

  if (error) return fail(`Gagal memperbarui status: ${error.message}`);

  // One audit row per report — a bulk action is still N individual decisions.
  for (const row of currents ?? []) {
    if (row.status === status) continue;
    await writeEvent(row.id, user.id, "status_changed", row.status, status, { bulk: true });
  }

  revalidatePath("/reports");
  revalidatePath("/");
  return { ok: true, data: { updated: reportIds.length } };
}

export async function archiveReportsAction(
  reportIds: string[],
  archived = true,
): Promise<ActionResult<{ updated: number }>> {
  const user = await getSessionUser();
  if (!user) return fail("Sesi berakhir. Silakan masuk kembali.");
  if (reportIds.length === 0) return fail("Tidak ada laporan yang dipilih.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ is_archived: archived })
    .in("id", reportIds);

  if (error) return fail(`Gagal mengarsipkan: ${error.message}`);

  for (const id of reportIds) {
    await writeEvent(
      id,
      user.id,
      "archived",
      archived ? "false" : "true",
      archived ? "true" : "false",
    );
  }

  revalidatePath("/reports");
  revalidatePath("/");
  return { ok: true, data: { updated: reportIds.length } };
}

// ==================================================== user administration

export type CreatedUser = { username: string; password: string };

/**
 * Creates an account. The *only* path by which one comes into existence inside
 * the app, and it demands an authenticated admin session first.
 *
 * The generated password is returned once, for the admin to hand over in
 * person. There is no email to send it to and no self-service reset.
 */
export async function createUserAction(formData: FormData): Promise<ActionResult<CreatedUser>> {
  const actor = await getSessionUser();
  if (!actor) return fail("Sesi berakhir. Silakan masuk kembali.");
  if (actor.profile?.role !== "admin" || !actor.profile.is_active) {
    return fail("Hanya admin yang dapat membuat akun.");
  }

  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "admin");

  if (!isValidUsername(username)) {
    return fail(
      "Nama pengguna minimal 3 karakter, diawali huruf atau angka, tanpa spasi atau simbol.",
    );
  }
  if (role !== "admin" && role !== "viewer") return fail("Peran tidak dikenali.");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existing) return fail(`Nama pengguna "${username}" sudah dipakai.`);

  const password = generatePassword();
  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    // Pre-confirmed: the address is synthetic and nothing is ever sent to it.
    email_confirm: true,
    user_metadata: { username, full_name: fullName || null },
  });

  if (createError || !created.user) {
    return fail(`Gagal membuat akun: ${createError?.message ?? "kesalahan tidak diketahui"}`);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    full_name: fullName || null,
    role,
    created_by: actor.id,
  });

  if (profileError) {
    // Roll back the auth user so a half-created account cannot log in with no
    // profile attached to it.
    await admin.auth.admin.deleteUser(created.user.id);
    return fail(`Gagal menyimpan profil: ${profileError.message}`);
  }

  revalidatePath("/admin/users");
  return { ok: true, data: { username, password } };
}

export async function resetPasswordAction(
  userId: string,
): Promise<ActionResult<{ password: string }>> {
  const actor = await getSessionUser();
  if (!actor) return fail("Sesi berakhir. Silakan masuk kembali.");
  if (actor.profile?.role !== "admin" || !actor.profile.is_active) {
    return fail("Hanya admin yang dapat mengatur ulang kata sandi.");
  }

  const password = generatePassword();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return fail(`Gagal mengatur ulang kata sandi: ${error.message}`);

  revalidatePath("/admin/users");
  return { ok: true, data: { password } };
}

export async function setUserActiveAction(
  userId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const actor = await getSessionUser();
  if (!actor) return fail("Sesi berakhir. Silakan masuk kembali.");
  if (actor.profile?.role !== "admin" || !actor.profile.is_active) {
    return fail("Hanya admin yang dapat menonaktifkan akun.");
  }
  if (userId === actor.id && !isActive) {
    return fail("Anda tidak dapat menonaktifkan akun Anda sendiri.");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) return fail(`Gagal memperbarui akun: ${error.message}`);

  // A deactivated user keeps a valid JWT until it expires; revoking their
  // refresh tokens is what actually ends the session.
  if (!isActive) {
    const { error: signOutError } = await admin.auth.admin.signOut(userId, "global");
    if (signOutError) console.error("[actions] gagal mencabut sesi", signOutError);
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
