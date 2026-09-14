"use client";

import { AlertCircle, CheckCircle2, ImageIcon, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CATEGORY_LABELS, CATEGORIES } from "@/lib/constants";
import { submitPublicReportAction } from "@/lib/public-actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type FormState = {
  narrative: string;
  incident_date: string;
  incident_at_text: string;
  location_text: string;
  desa: string;
  kecamatan: string;
  kabupaten: string;
  reported_party: string;
  reported_party_role: string;
  category: string;
  item_given: string;
  item_value: string;
  evidence_note: string;
  identity_disclosed: boolean;
  reporter_name: string;
  reporter_contact: string;
  reporter_address: string;
};

const EMPTY: FormState = {
  narrative: "",
  incident_date: "",
  incident_at_text: "",
  location_text: "",
  desa: "",
  kecamatan: "",
  kabupaten: "",
  reported_party: "",
  reported_party_role: "",
  category: "",
  item_given: "",
  item_value: "",
  evidence_note: "",
  identity_disclosed: false,
  reporter_name: "",
  reporter_contact: "",
  reporter_address: "",
};

function Field({
  label,
  htmlFor,
  hint,
  optional = true,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="flex items-baseline gap-2">
        {label}
        {optional ? (
          <span className="text-xs font-normal text-muted-foreground">opsional</span>
        ) : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground text-pretty">{hint}</p> : null}
    </div>
  );
}

export function PublicReportForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedAt = useRef<number>(0);

  // Used to reject submissions that arrive impossibly fast. Set on mount so a
  // bot that never renders the page cannot produce a plausible value.
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "narrative") setError(null);
  }

  function onFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const chosen = Array.from(event.target.files ?? []);

    if (chosen.length > MAX_FILES) {
      setFileError(`Maksimal ${MAX_FILES} foto.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFiles([]);
      return;
    }

    const tooBig = chosen.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setFileError(`Foto "${tooBig.name}" melebihi 5 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFiles([]);
      return;
    }

    setFiles(chosen);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (form.narrative.trim() === "") {
      setError("Isi uraian kejadian minimal satu kalimat.");
      return;
    }

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
    put("reported_party", form.reported_party);
    put("reported_party_role", form.reported_party_role);
    put("category", form.category);
    put("item_given", form.item_given);
    put("item_value", form.item_value);
    put("evidence_note", form.evidence_note);

    payload.provinsi = "Kalimantan Tengah";
    payload.identity_disclosed = form.identity_disclosed;

    if (form.identity_disclosed) {
      put("reporter_name", form.reporter_name);
      put("reporter_contact", form.reporter_contact);
      put("reporter_address", form.reporter_address);
    }

    const data = new FormData();
    data.set("payload", JSON.stringify(payload));
    data.set("elapsed_ms", String(Date.now() - mountedAt.current));
    // Honeypot. Always empty for a real person — the field is hidden from view.
    data.set("alamat_surel", (event.currentTarget.elements.namedItem(
      "alamat_surel",
    ) as HTMLInputElement | null)?.value ?? "");
    for (const file of files) data.append("files", file);

    setSubmitting(true);
    const result = await submitPublicReportAction(data);
    setSubmitting(false);

    if (result.ok) {
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(result.error);
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <CheckCircle2
              className="size-7 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
          </div>

          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-balance">
              Terima kasih. Laporan Anda telah kami terima.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Laporan Anda akan ditelaah oleh pengawas pemilu. Setiap laporan
              diperlakukan sebagai dugaan yang masih harus diverifikasi, dan
              identitas pelapor tidak dipublikasikan.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setForm(EMPTY);
              setFiles([]);
              setDone(false);
              setError(null);
              setFileError(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
              mountedAt.current = Date.now();
            }}
          >
            Kirim laporan lain
          </Button>
        </CardContent>
      </Card>
    );
  }

  const identityDisabled = !form.identity_disclosed;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Honeypot. Hidden from people, filled in by naive bots.
          Kept out of the tab order and hidden from screen readers. */}
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="alamat_surel">Jangan isi kolom ini</label>
        <input
          id="alamat_surel"
          name="alamat_surel"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apa yang terjadi?</CardTitle>
          <CardDescription>
            Ceritakan sejelas yang Anda ingat. Hanya bagian ini yang wajib diisi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field
            label="Uraian kejadian"
            htmlFor="narrative"
            optional={false}
            hint="Sebutkan apa yang Anda lihat atau alami, siapa yang terlibat, dan di mana."
          >
            <Textarea
              id="narrative"
              value={form.narrative}
              onChange={(e) => set("narrative", e.target.value)}
              rows={7}
              required
              aria-invalid={error !== null}
              className="text-base"
              placeholder="Contoh: Semalam ada orang membagikan amplop berisi uang kepada warga di RT 03 sambil meminta memilih calon tertentu."
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tanggal kejadian" htmlFor="incident_date">
              <Input
                id="incident_date"
                type="date"
                value={form.incident_date}
                onChange={(e) => set("incident_date", e.target.value)}
              />
            </Field>

            <Field
              label="Perkiraan waktu"
              htmlFor="incident_at_text"
              hint="Boleh perkiraan saja."
            >
              <Input
                id="incident_at_text"
                value={form.incident_at_text}
                onChange={(e) => set("incident_at_text", e.target.value)}
                placeholder="kemarin malam, sekitar habis isya"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Di mana kejadiannya?</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Lokasi" htmlFor="location_text" className="sm:col-span-2">
            <Input
              id="location_text"
              value={form.location_text}
              onChange={(e) => set("location_text", e.target.value)}
              placeholder="Dekat masjid, balai desa, RT 03…"
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
          <Field label="Kabupaten/Kota" htmlFor="kabupaten" className="sm:col-span-2">
            <Input
              id="kabupaten"
              value={form.kabupaten}
              onChange={(e) => set("kabupaten", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Siapa yang dilaporkan?</CardTitle>
          <CardDescription>
            Kosongkan jika Anda tidak tahu atau tidak yakin.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nama atau ciri-ciri" htmlFor="reported_party">
            <Input
              id="reported_party"
              value={form.reported_party}
              onChange={(e) => set("reported_party", e.target.value)}
              placeholder="Nama, julukan, atau ciri yang Anda ingat"
            />
          </Field>
          <Field label="Jabatan atau peran" htmlFor="reported_party_role">
            <Input
              id="reported_party_role"
              value={form.reported_party_role}
              onChange={(e) => set("reported_party_role", e.target.value)}
              placeholder="Tim sukses, perangkat desa…"
            />
          </Field>

          <Field
            label="Jenis dugaan"
            htmlFor="category"
            className="sm:col-span-2"
            hint="Pilih yang paling mendekati, atau tulis dengan kata-kata Anda sendiri."
          >
            <Input
              id="category"
              list="public-category-options"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Politik uang, intimidasi, pelanggaran kampanye…"
            />
            <datalist id="public-category-options">
              {CATEGORIES.filter((c) => c !== "bukan_pelanggaran" && c !== "lainnya").map(
                (c) => (
                  <option key={c} value={CATEGORY_LABELS[c]} />
                ),
              )}
            </datalist>
          </Field>

          <Field label="Bentuk pemberian" htmlFor="item_given" hint="Jika ada.">
            <Input
              id="item_given"
              value={form.item_given}
              onChange={(e) => set("item_given", e.target.value)}
              placeholder="Uang tunai, sembako, voucher…"
            />
          </Field>
          <Field label="Perkiraan nilai" htmlFor="item_value">
            <Input
              id="item_value"
              value={form.item_value}
              onChange={(e) => set("item_value", e.target.value)}
              placeholder="50.000 atau sekitar 50 ribuan"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bukti</CardTitle>
          <CardDescription>
            Foto sangat membantu, tetapi jangan mengambil risiko untuk
            mendapatkannya.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Keterangan bukti" htmlFor="evidence_note">
            <Textarea
              id="evidence_note"
              value={form.evidence_note}
              onChange={(e) => set("evidence_note", e.target.value)}
              rows={3}
              placeholder="Misalnya: ada rekaman video dari warga lain, atau foto amplop."
            />
          </Field>

          <Field
            label="Unggah foto"
            htmlFor="files"
            hint={`Maksimal ${MAX_FILES} foto, masing-masing 5 MB.`}
          >
            <Input
              id="files"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFilesChosen}
            />
          </Field>

          {fileError ? (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {fileError}
            </p>
          ) : null}

          {files.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-md border p-3">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 text-sm">
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{file.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identitas Anda</CardTitle>
          <CardDescription>
            Anda boleh melapor tanpa menyebutkan identitas. Laporan tanpa
            identitas tetap ditindaklanjuti sebagai Informasi Awal, namun hanya
            laporan dengan identitas lengkap yang dapat diregistrasi sebagai
            Laporan resmi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="identity_disclosed">Saya bersedia mencantumkan identitas</Label>
            <Switch
              id="identity_disclosed"
              checked={form.identity_disclosed}
              onCheckedChange={(v) => set("identity_disclosed", v)}
            />
          </div>

          <div
            className={cn(
              "grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2",
              identityDisabled && "opacity-50",
            )}
          >
            <Field label="Nama" htmlFor="reporter_name">
              <Input
                id="reporter_name"
                value={form.reporter_name}
                onChange={(e) => set("reporter_name", e.target.value)}
                disabled={identityDisabled}
                autoComplete="off"
              />
            </Field>
            <Field label="Nomor yang bisa dihubungi" htmlFor="reporter_contact">
              <Input
                id="reporter_contact"
                value={form.reporter_contact}
                onChange={(e) => set("reporter_contact", e.target.value)}
                disabled={identityDisabled}
                autoComplete="off"
              />
            </Field>
            <Field label="Alamat" htmlFor="reporter_address" className="sm:col-span-2">
              <Input
                id="reporter_address"
                value={form.reporter_address}
                onChange={(e) => set("reporter_address", e.target.value)}
                disabled={identityDisabled}
                autoComplete="off"
              />
            </Field>
          </div>

          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-pretty">
              <strong className="font-medium">Jangan menuliskan NIK, nomor KTP,
              nomor rekening, atau NPWP</strong> di formulir ini — baik milik Anda
              maupun milik orang lain. Data seperti itu otomatis ditolak dan tidak
              disimpan oleh sistem.
            </span>
          </p>
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background/95 py-4 backdrop-blur">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Mengirim…
            </>
          ) : (
            "Kirim laporan"
          )}
        </Button>
        {form.narrative.trim() !== "" && !submitting ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(EMPTY);
              setFiles([]);
              setError(null);
              setFileError(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            <X className="size-4" aria-hidden />
            Kosongkan
          </Button>
        ) : null}
      </div>
    </form>
  );
}
