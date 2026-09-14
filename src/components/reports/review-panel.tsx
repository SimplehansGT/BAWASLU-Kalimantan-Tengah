"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { updateNotesAction, updatePriorityAction, updateStatusAction } from "@/lib/actions";
import { STATUSES, STATUS_LABELS } from "@/lib/constants";
import { ConfirmDialog } from "@/components/reports/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** Status, priority and reviewer notes — the three things a reviewer changes. */
export function ReviewPanel({
  reportId,
  status,
  priority,
  notes,
}: {
  reportId: string;
  status: string;
  priority: string;
  notes: string | null;
}) {
  const router = useRouter();

  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentPriority, setCurrentPriority] = useState(priority);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [pendingClose, setPendingClose] = useState<string | null>(null);

  // Tracks the last value actually persisted, so blur does not re-save
  // something that is already stored.
  const savedNotes = useRef(notes ?? "");

  async function applyStatus(next: string) {
    const previous = currentStatus;
    setCurrentStatus(next);

    const result = await updateStatusAction(reportId, next);
    if (result.ok) {
      toast.success(`Status diubah menjadi "${STATUS_LABELS[next as never] ?? next}".`);
      router.refresh();
    } else {
      setCurrentStatus(previous);
      toast.error(result.error);
    }
  }

  function onStatusChange(next: string | null) {
    if (!next || next === currentStatus) return;
    if (next === "ditutup") {
      setPendingClose(next);
      return;
    }
    void applyStatus(next);
  }

  async function onPriorityChange(urgent: boolean) {
    const next = urgent ? "urgent" : "normal";
    const previous = currentPriority;
    setCurrentPriority(next);

    const result = await updatePriorityAction(reportId, next);
    if (result.ok) {
      toast.success(urgent ? "Ditandai urgent." : "Prioritas dikembalikan ke normal.");
      router.refresh();
    } else {
      setCurrentPriority(previous);
      toast.error(result.error);
    }
  }

  async function saveNotes() {
    if (draftNotes === savedNotes.current) return;

    setSavingNotes(true);
    const result = await updateNotesAction(reportId, draftNotes);
    setSavingNotes(false);

    if (result.ok) {
      savedNotes.current = draftNotes;
      toast.success("Catatan disimpan.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <Select value={currentStatus} onValueChange={onStatusChange}>
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="priority">Prioritas urgent</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Laporan urgent naik ke urutan teratas daftar.
          </p>
        </div>
        <Switch
          id="priority"
          checked={currentPriority === "urgent"}
          onCheckedChange={onPriorityChange}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Catatan peninjau</Label>
        <Textarea
          id="notes"
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          onBlur={saveNotes}
          rows={6}
          placeholder="Catatan internal: hasil telaah, langkah tindak lanjut, kebutuhan klarifikasi…"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {savingNotes ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Menyimpan…
              </span>
            ) : (
              "Tersimpan otomatis saat kursor meninggalkan kolom."
            )}
          </p>
          {draftNotes !== savedNotes.current ? (
            <Button size="sm" variant="secondary" onClick={saveNotes} disabled={savingNotes}>
              Simpan
            </Button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={pendingClose !== null}
        onOpenChange={(open) => !open && setPendingClose(null)}
        title="Tutup laporan ini?"
        description="Laporan akan ditandai ditutup dan keluar dari antrean penanganan aktif. Perubahan tercatat dalam jejak audit dan dapat dikembalikan."
        confirmLabel="Ya, tutup laporan"
        onConfirm={async () => {
          if (pendingClose) await applyStatus(pendingClose);
          setPendingClose(null);
        }}
      />
    </div>
  );
}
