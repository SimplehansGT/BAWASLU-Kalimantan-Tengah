"use client";

import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateFieldAction } from "@/lib/actions";
import { EMPTY_FIELD_TEXT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * One field on the detail page.
 *
 * An empty field renders as `— belum diisi —` rather than disappearing: a
 * reviewer needs to see at a glance which of the Perbawaslu requirements the
 * intake failed to capture, and a hidden row tells them nothing.
 */
export function EditableField({
  reportId,
  field,
  label,
  value,
  display,
  editable,
  multiline = false,
  type = "text",
}: {
  reportId: string;
  field: string;
  label: string;
  value: string | null;
  display: string;
  editable: boolean;
  multiline?: boolean;
  type?: "text" | "number";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  const isEmpty = display === EMPTY_FIELD_TEXT;

  async function save() {
    if (draft === (value ?? "")) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await updateFieldAction(reportId, field, draft);
    setSaving(false);

    if (result.ok) {
      toast.success(`${label} diperbarui.`);
      setEditing(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {multiline ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            autoFocus
            disabled={saving}
          />
        ) : (
          <Input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") cancel();
            }}
          />
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            <Check className="size-4" aria-hidden />
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            <X className="size-4" aria-hidden />
            Batal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <p
          className={cn(
            "mt-0.5 text-sm break-words",
            isEmpty ? "text-muted-foreground italic" : "text-foreground",
            multiline && "whitespace-pre-wrap",
          )}
        >
          {display}
        </p>
      </div>

      {editable ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => setEditing(true)}
          aria-label={`Ubah ${label}`}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
