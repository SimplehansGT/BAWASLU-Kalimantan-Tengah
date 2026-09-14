import {
  Archive,
  FilePlus2,
  MessageSquare,
  Pencil,
  SignalHigh,
  Workflow,
} from "lucide-react";

import { formatDateTime, priorityLabel, statusLabel } from "@/lib/format";
import type { ReportEventRow } from "@/types/database";

type AuditEvent = ReportEventRow & { actor_username: string | null };

const EVENT_META: Record<
  string,
  { icon: React.ElementType; label: (e: AuditEvent) => string }
> = {
  created: {
    icon: FilePlus2,
    label: () => "Laporan diterima",
  },
  status_changed: {
    icon: Workflow,
    label: (e) =>
      `Status diubah dari "${statusLabel(e.from_value)}" menjadi "${statusLabel(e.to_value)}"`,
  },
  priority_changed: {
    icon: SignalHigh,
    label: (e) =>
      `Prioritas diubah dari "${priorityLabel(e.from_value)}" menjadi "${priorityLabel(e.to_value)}"`,
  },
  note_added: {
    icon: MessageSquare,
    label: () => "Catatan peninjau diperbarui",
  },
  edited: {
    icon: Pencil,
    label: (e) => {
      const field =
        e.detail && typeof e.detail === "object" && !Array.isArray(e.detail)
          ? String((e.detail as Record<string, unknown>).field ?? "kolom")
          : "kolom";
      return `Kolom "${field}" diubah`;
    },
  },
  archived: {
    icon: Archive,
    label: (e) => (e.to_value === "true" ? "Laporan diarsipkan" : "Laporan dikeluarkan dari arsip"),
  },
};

/**
 * The audit trail.
 *
 * Every state change on an allegation record is written here with its actor and
 * timestamp, and nothing in the app can edit or delete a row once written.
 */
export function AuditLog({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>;
  }

  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const meta = EVENT_META[event.event_type];
        const Icon = meta?.icon ?? Pencil;
        const label = meta?.label(event) ?? event.event_type;
        const isLast = index === events.length - 1;

        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast ? (
              <span
                className="absolute top-7 left-[11px] h-full w-px bg-border"
                aria-hidden
              />
            ) : null}

            <span className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background">
              <Icon className="size-3" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-pretty">{label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(event.created_at)}
                {" · "}
                {event.actor_username ?? "Sistem (intake otomatis)"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
