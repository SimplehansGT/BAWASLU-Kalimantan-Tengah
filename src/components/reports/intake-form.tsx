"use client";

import { AlertCircle, FileJson, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { createReportAction } from "@/lib/actions";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/constants";
import { normalizeReport } from "@/lib/normalize";
import { SAMPLE_PAYLOADS } from "@/lib/sample-payloads";
import { cn } from "@/lib/utils";
import { WarningChips } from "@/components/reports/report-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ExtraPair = { id: string; key: string; value: string };

type FormState = {
  narrative: string;
  incident_date: string;
  incident_at_text: string;
  location_text: string;
  desa: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  reported_party: string;
  reported_party_role: string;
  category: string;
  item_given: string;
  item_value: string;
  item_value_text: string;
  recipients_estimate: string;
  witness_count: string;
  has_evidence: boolean;
  evidence_note: string;
  identity_disclosed: boolean;
  reporter_name: string;
  reporter_address: string;
  reporter_contact: string;
  priority: "normal" | "urgent";
};

const EMPTY_FORM: FormState = {
  narrative: "",
  incident_date: "",
  incident_at_text: "",
  location_text: "",
  desa: "",
  kecamatan: "",
  kabupaten: "",
  provinsi: "",
  reported_party: "",
  reported_party_role: "",
  category: "",
  item_given: "",
  item_value: "",
  item_value_text: "",
  recipients_estimate: "",
  witness_count: "",
  has_evidence: false,
  evidence_note: "",
  identity_disclosed: false,
  reporter_name: "",
  reporter_address: "",
  reporter_contact: "",
  priority: "normal",
};

function newPairId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Drops empty strings so the payload carries only what was actually entered. */
function compact(form: FormState, extras: ExtraPair[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const put = (key: string, value: string) => {
    if (value.trim() !== "") payload[key] = value.trim();
  };

  put("narrative", form.narrative);
  if (form.incident_date.trim() !== "") payload.incident_at = form.incident_date;
  put("incident_at_text", form.incident_at_text);
  put("location_text", form.location_text);
  put("desa", form.desa);
  put("kecamatan", form.kecamatan);
  put("kabupaten", form.kabupaten);
  put("provinsi", form.provinsi);
  put("reported_party", form.reported_party);
  put("reported_party_role", form.reported_party_role);
  put("category", form.category);
  put("item_given", form.item_given);
  put("item_value", form.item_value);
  put("item_value_text", form.item_value_text);
  put("recipients_estimate", form.recipients_estimate);
  put("witness_count", form.witness_count);
  put("evidence_note", form.evidence_note);

  payload.has_evidence = form.has_evidence;
  payload.identity_disclosed = form.identity_disclosed;
  payload.priority = form.priority;

  // Reporter identity is only sent when it was deliberately disclosed.
  if (form.identity_disclosed) {
    put("reporter_name", form.reporter_name);
    put("reporter_address", form.reporter_address);
    put("reporter_contact", form.reporter_contact);
  }

  for (const pair of extras) {
    const key = pair.key.trim();
    if (key === "") continue;
    payload[key] = pair.value;
  }

  return payload;
}

/** Maps a parsed JSON payload back onto the form fields. */
function payloadToForm(payload: Record<string, unknown>): {
  form: FormState;
  extras: ExtraPair[];
} {
  const str = (v: unknown) =>
    v === null || v === undefined ? "" : typeof v === "string" ? v : String(v);

  const known = new Set([
    "narrative",
    "incident_at",
    "incident_at_text",
    "location_text",
    "desa",
    "kecamatan",
    "kabupaten",
    "provinsi",
    "reported_party",
    "reported_party_role",
    "category",
    "item_given",
    "item_value",
    "item_value_text",
    "recipients_estimate",
    "witness_count",
    "has_evidence",
    "evidence_note",
    "identity_disclosed",
    "reporter_name",
    "reporter_address",
    "reporter_contact",
    "priority",
    "raw_transcript",
  ]);

  // Only a plain YYYY-MM-DD survives into the date input; anything looser stays
  // readable in "Keterangan waktu" instead of being silently dropped.
  const rawDate = str(payload.incident_at);
  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : "";

  const truthy = (v: unknown) =>
    v === true ||
    (typeof v === "string" && ["ya", "iya", "true", "1", "ada", "benar"].includes(v.toLowerCase()));

  const form: FormState = {
    ...EMPTY_FORM,
    narrative: str(payload.narrative),
    incident_date: isoDate,
    incident_at_text: str(payload.incident_at_text) || (isoDate === "" ? rawDate : ""),
    location_text: str(payload.location_text),
    desa: str(payload.desa),
    kecamatan: str(payload.kecamatan),
    kabupaten: str(payload.kabupaten),
    provinsi: str(payload.provinsi),
    reported_party: str(payload.reported_party),
    reported_party_role: str(payload.reported_party_role),
    category: str(payload.category),
    item_given: str(payload.item_given),
    item_value: str(payload.item_value),
    item_value_text: str(payload.item_value_text),
    recipients_estimate: str(payload.recipients_estimate),
    witness_count: str(payload.witness_count),
    has_evidence: truthy(payload.has_evidence),
    evidence_note: str(payload.evidence_note),
    identity_disclosed: truthy(payload.identity_disclosed),
    reporter_name: str(payload.reporter_name),
    reporter_address: str(payload.reporter_address),
    reporter_contact: str(payload.reporter_contact),
    priority: str(payload.priority).toLowerCase().includes("urgen") ? "urgent" : "normal",
  };

  const extras: ExtraPair[] = Object.entries(payload)
    .filter(([key]) => !known.has(key))
    .map(([key, value]) => ({
      id: newPairId(),
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));

  return { form, extras };
}

function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function IntakeForm() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [extras, setExtras] = useState<ExtraPair[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("form");

  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const sampleIndex = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "narrative") setNarrativeError(null);
  }

  async function submit(mode: "form" | "json", overridePayload?: Record<string, unknown>) {
    const payload = overridePayload ?? compact(form, extras);

    // The single required field, checked the same way the server checks it.
    if (!overridePayload) {
      const narrative = String(payload.narrative ?? "").trim();
      if (narrative === "") {
        setNarrativeError("Isi uraian kejadian minimal satu kalimat.");
        setTab("form");
        toast.error("Isi uraian kejadian minimal satu kalimat.");
        return;
      }
    }

    setSubmitting(true);

    const data = new FormData();
    data.set("payload", JSON.stringify(payload));
    data.set("source", mode);
    for (const file of files) data.append("files", file);

    const result = await createReportAction(data);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`Laporan ${result.data.ticket} tersimpan.`);
    router.push(`/reports/${result.data.id}`);
  }

  function loadSample() {
    const sample = SAMPLE_PAYLOADS[sampleIndex.current % SAMPLE_PAYLOADS.length];
    sampleIndex.current += 1;

    setJsonText(JSON.stringify(sample.payload, null, 2));
    setJsonError(null);
    toast.info(`Contoh dimuat: ${sample.label}`, { description: sample.note });
  }

  function applyJson() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "JSON tidak valid.");
      setWarnings([]);
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setJsonError("JSON harus berupa objek, bukan larik atau nilai tunggal.");
      return;
    }

    setJsonError(null);

    // Preview exactly what the server-side normaliser will make of it.
    const { warnings: parseWarnings } = normalizeReport(parsed);
    setWarnings(parseWarnings);

    const { form: nextForm, extras: nextExtras } = payloadToForm(
      parsed as Record<string, unknown>,
    );
    setForm(nextForm);
    setExtras(nextExtras);
    setNarrativeError(null);
    setTab("form");

    toast.success(
      parseWarnings.length > 0
        ? `Formulir terisi dengan ${parseWarnings.length} peringatan.`
        : "Formulir terisi dari JSON.",
    );
  }

  async function saveAsRaw() {
    await submit("json", { raw_transcript: jsonText });
  }

  const identityDisabled = !form.identity_disclosed;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v ?? "form")}>
      <TabsList>
        <TabsTrigger value="form">Formulir</TabsTrigger>
        <TabsTrigger value="json">
          <FileJson className="size-4" aria-hidden />
          Tempel JSON
        </TabsTrigger>
      </TabsList>

      {/* ============================================================ FORM */}
      <TabsContent value="form" className="mt-4 flex flex-col gap-4">
        {warnings.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Peringatan penguraian</p>
            <WarningChips warnings={warnings} />
            <p className="text-xs text-muted-foreground">
              Peringatan tidak menghalangi penyimpanan. Laporan tetap dapat dikirim.
            </p>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kejadian</CardTitle>
            <CardDescription>
              Hanya uraian kejadian yang wajib diisi. Sisanya boleh kosong.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field
              label="Uraian kejadian"
              htmlFor="narrative"
              hint="Apa yang terjadi, siapa yang terlibat, di mana, dan kapan — sebisanya."
            >
              <Textarea
                id="narrative"
                value={form.narrative}
                onChange={(e) => set("narrative", e.target.value)}
                rows={6}
                aria-invalid={narrativeError !== null}
                aria-describedby={narrativeError ? "narrative-error" : undefined}
                className="text-base"
                placeholder="Contoh: Ada pembagian uang Rp 50.000 per orang di RT 03 sambil diminta memilih calon tertentu."
              />
              {narrativeError ? (
                <p
                  id="narrative-error"
                  role="alert"
                  className="flex items-center gap-1.5 text-sm text-destructive"
                >
                  <AlertCircle className="size-4 shrink-0" aria-hidden />
                  {narrativeError}
                </p>
              ) : null}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tanggal kejadian" htmlFor="incident_date" hint="Opsional.">
                <Input
                  id="incident_date"
                  type="date"
                  value={form.incident_date}
                  onChange={(e) => set("incident_date", e.target.value)}
                />
              </Field>

              <Field
                label="Keterangan waktu"
                htmlFor="incident_at_text"
                hint='Kata-kata pelapor, misalnya "kemarin malam" atau "abis isya".'
              >
                <Input
                  id="incident_at_text"
                  value={form.incident_at_text}
                  onChange={(e) => set("incident_at_text", e.target.value)}
                  placeholder="kemarin malam"
                />
              </Field>

              <Field label="Lokasi" htmlFor="location_text" className="sm:col-span-2">
                <Input
                  id="location_text"
                  value={form.location_text}
                  onChange={(e) => set("location_text", e.target.value)}
                  placeholder="Deket masjid Al Ikhlas, RT 03"
                />
              </Field>

              <Field label="Desa/Kelurahan" htmlFor="desa">
                <Input
                  id="desa"
                  value={form.desa}
                  onChange={(e) => set("desa", e.target.value)}
                />
              </Field>

              <Field label="Kecamatan" htmlFor="kecamatan">
                <Input
                  id="kecamatan"
                  value={form.kecamatan}
                  onChange={(e) => set("kecamatan", e.target.value)}
                />
              </Field>

              <Field label="Kabupaten/Kota" htmlFor="kabupaten">
                <Input
                  id="kabupaten"
                  value={form.kabupaten}
                  onChange={(e) => set("kabupaten", e.target.value)}
                />
              </Field>

              <Field label="Provinsi" htmlFor="provinsi">
                <Input
                  id="provinsi"
                  value={form.provinsi}
                  onChange={(e) => set("provinsi", e.target.value)}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Terlapor</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nama atau ciri terlapor" htmlFor="reported_party">
              <Input
                id="reported_party"
                value={form.reported_party}
                onChange={(e) => set("reported_party", e.target.value)}
                placeholder="Nama, julukan, atau ciri-ciri"
              />
            </Field>
            <Field label="Jabatan atau peran" htmlFor="reported_party_role">
              <Input
                id="reported_party_role"
                value={form.reported_party_role}
                onChange={(e) => set("reported_party_role", e.target.value)}
                placeholder="Tim sukses, kepala desa, ASN…"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dugaan</CardTitle>
            <CardDescription>
              Kategori boleh diisi bebas — sistem akan memetakannya sendiri dan
              tetap menyimpan teks aslinya.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Kategori"
              htmlFor="category"
              className="sm:col-span-2"
              hint="Pilih dari daftar atau ketik bebas."
            >
              <Input
                id="category"
                list="category-options"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="politik uang, intimidasi, penyalahgunaan fasilitas…"
              />
              <datalist id="category-options">
                {CATEGORIES.map((c) => (
                  <option key={c} value={CATEGORY_LABELS[c]} />
                ))}
              </datalist>
            </Field>

            <Field label="Bentuk pemberian" htmlFor="item_given">
              <Input
                id="item_given"
                value={form.item_given}
                onChange={(e) => set("item_given", e.target.value)}
                placeholder="uang tunai, sembako, voucher…"
              />
            </Field>

            <Field label="Nilai (Rp)" htmlFor="item_value">
              <Input
                id="item_value"
                inputMode="numeric"
                value={form.item_value}
                onChange={(e) => set("item_value", e.target.value)}
                placeholder="50000"
              />
            </Field>

            <Field
              label="Keterangan nilai"
              htmlFor="item_value_text"
              hint="Jika pelapor hanya menyebut perkiraan."
            >
              <Input
                id="item_value_text"
                value={form.item_value_text}
                onChange={(e) => set("item_value_text", e.target.value)}
                placeholder="sekitar 50 ribuan"
              />
            </Field>

            <Field label="Perkiraan penerima" htmlFor="recipients_estimate">
              <Input
                id="recipients_estimate"
                inputMode="numeric"
                value={form.recipients_estimate}
                onChange={(e) => set("recipients_estimate", e.target.value)}
              />
            </Field>

            <Field label="Jumlah saksi" htmlFor="witness_count">
              <Input
                id="witness_count"
                inputMode="numeric"
                value={form.witness_count}
                onChange={(e) => set("witness_count", e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bukti</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="has_evidence">Ada bukti</Label>
              <Switch
                id="has_evidence"
                checked={form.has_evidence}
                onCheckedChange={(v) => set("has_evidence", v)}
              />
            </div>

            <Field label="Keterangan bukti" htmlFor="evidence_note">
              <Textarea
                id="evidence_note"
                value={form.evidence_note}
                onChange={(e) => set("evidence_note", e.target.value)}
                rows={3}
                placeholder="Foto amplop, rekaman video pendek, tangkapan layar percakapan…"
              />
            </Field>

            <Field label="Unggah berkas" htmlFor="files" hint="Gambar, bisa lebih dari satu.">
              <Input
                id="files"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </Field>

            {files.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-md border p-3">
                {files.map((file) => (
                  <li
                    key={`${file.name}-${file.size}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Upload className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{file.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pelapor</CardTitle>
            <CardDescription>
              Laporan tanpa identitas tetap diterima sebagai Informasi Awal.
              Identitas lengkap diperlukan agar dapat diregistrasi sebagai
              Laporan resmi.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="identity_disclosed">Identitas dicantumkan</Label>
              <Switch
                id="identity_disclosed"
                checked={form.identity_disclosed}
                onCheckedChange={(v) => set("identity_disclosed", v)}
              />
            </div>

            {/* Disabled rather than hidden: the operator should be able to see
                that these were deliberately skipped, not wonder where they went. */}
            <div
              className={cn(
                "grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2",
                identityDisabled && "opacity-50",
              )}
            >
              <Field label="Nama pelapor" htmlFor="reporter_name">
                <Input
                  id="reporter_name"
                  value={form.reporter_name}
                  onChange={(e) => set("reporter_name", e.target.value)}
                  disabled={identityDisabled}
                />
              </Field>
              <Field label="Kontak pelapor" htmlFor="reporter_contact">
                <Input
                  id="reporter_contact"
                  value={form.reporter_contact}
                  onChange={(e) => set("reporter_contact", e.target.value)}
                  disabled={identityDisabled}
                />
              </Field>
              <Field label="Alamat pelapor" htmlFor="reporter_address" className="sm:col-span-2">
                <Input
                  id="reporter_address"
                  value={form.reporter_address}
                  onChange={(e) => set("reporter_address", e.target.value)}
                  disabled={identityDisabled}
                />
              </Field>
            </div>

            <p className="text-xs text-muted-foreground text-pretty">
              Jangan mencatat NIK, nomor KTP, atau nomor rekening. Sistem menolak
              dan tidak menyimpan data tersebut.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lain-lain</CardTitle>
            <CardDescription>
              Keterangan tambahan yang belum punya kolom sendiri. Tersimpan apa
              adanya pada data tambahan.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {extras.map((pair) => (
              <div key={pair.id} className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={pair.key}
                  onChange={(e) =>
                    setExtras((prev) =>
                      prev.map((p) => (p.id === pair.id ? { ...p, key: e.target.value } : p)),
                    )
                  }
                  placeholder="nama_kolom"
                  aria-label="Nama kolom tambahan"
                  className="sm:w-1/3"
                />
                <Input
                  value={pair.value}
                  onChange={(e) =>
                    setExtras((prev) =>
                      prev.map((p) => (p.id === pair.id ? { ...p, value: e.target.value } : p)),
                    )
                  }
                  placeholder="isi"
                  aria-label="Isi kolom tambahan"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setExtras((prev) => prev.filter((p) => p.id !== pair.id))}
                  aria-label="Hapus baris"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                setExtras((prev) => [...prev, { id: newPairId(), key: "", value: "" }])
              }
            >
              <Plus className="size-4" aria-hidden />
              Tambah baris
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prioritas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="priority">Tandai sebagai urgent</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Untuk ancaman, kekerasan, atau kejadian yang sedang berlangsung.
                </p>
              </div>
              <Switch
                id="priority"
                checked={form.priority === "urgent"}
                onCheckedChange={(v) => set("priority", v ? "urgent" : "normal")}
              />
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background/95 py-4 backdrop-blur">
          <Button onClick={() => submit("form")} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Menyimpan…
              </>
            ) : (
              "Simpan laporan"
            )}
          </Button>
          <Button
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              setForm(EMPTY_FORM);
              setExtras([]);
              setFiles([]);
              setWarnings([]);
              setNarrativeError(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            Kosongkan formulir
          </Button>
        </div>
      </TabsContent>

      {/* ============================================================ JSON */}
      <TabsContent value="json" className="mt-4 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tempel JSON</CardTitle>
            <CardDescription>
              Persis format yang nanti dikirim bot intake melalui{" "}
              <code className="font-mono text-xs">POST /api/reports</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
              }}
              rows={16}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder={'{\n  "narrative": "…"\n}'}
              aria-label="Muatan JSON"
            />

            {jsonError ? (
              <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    JSON tidak dapat diuraikan:{" "}
                    <span className="font-mono text-xs">{jsonError}</span>
                  </span>
                </p>
                <p className="text-xs text-muted-foreground text-pretty">
                  Isi tetap dapat diarsipkan apa adanya agar tidak hilang, lalu
                  dirapikan oleh petugas kemudian.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={saveAsRaw}
                  disabled={submitting || jsonText.trim() === ""}
                >
                  Simpan sebagai teks mentah
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={applyJson} disabled={jsonText.trim() === ""}>
                Uraikan dan isi formulir
              </Button>
              <Button variant="outline" onClick={loadSample}>
                Muat contoh
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setJsonText("");
                  setJsonError(null);
                }}
              >
                Kosongkan
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
