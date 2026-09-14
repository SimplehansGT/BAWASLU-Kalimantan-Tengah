import { AlertTriangle, EyeOff, ShieldCheck, UserCheck } from "lucide-react";

import {
  CATEGORY_BADGE_CLASS,
  STATUS_BADGE_CLASS,
  categoryLabel,
  reportClassLabel,
  statusLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function CategoryBadge({ value }: { value: string | null }) {
  const key = value ?? "lainnya";
  return (
    <Badge
      variant="outline"
      className={cn("border", CATEGORY_BADGE_CLASS[key] ?? CATEGORY_BADGE_CLASS.lainnya)}
    >
      {categoryLabel(key)}
    </Badge>
  );
}

export function StatusBadge({ value }: { value: string | null }) {
  const key = value ?? "baru";
  return (
    <Badge
      variant="outline"
      className={cn("border", STATUS_BADGE_CLASS[key] ?? STATUS_BADGE_CLASS.baru)}
    >
      {statusLabel(key)}
    </Badge>
  );
}

export function PriorityBadge({ value }: { value: string | null }) {
  if (value !== "urgent") {
    return (
      <Badge variant="outline" className="border text-muted-foreground">
        Normal
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle aria-hidden />
      Urgent
    </Badge>
  );
}

/**
 * Laporan Resmi vs Informasi Awal. The distinction is legal, not cosmetic: only
 * a report meeting the formal requirements of Perbawaslu 7/2022 Pasal 15 can be
 * registered as a Laporan.
 */
export function ReportClassBadge({ value }: { value: string | null }) {
  const isFormal = value === "laporan";
  return (
    <Badge variant="outline" className="gap-1 border">
      {isFormal ? <ShieldCheck aria-hidden /> : null}
      {reportClassLabel(value ?? "informasi_awal")}
    </Badge>
  );
}

export function IdentityIcon({ disclosed }: { disclosed: boolean }) {
  return disclosed ? (
    <span
      className="inline-flex items-center gap-1 text-xs text-foreground"
      title="Identitas pelapor dicantumkan"
    >
      <UserCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <span className="sr-only">Identitas dicantumkan</span>
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title="Identitas pelapor tidak dicantumkan"
    >
      <EyeOff className="size-4" aria-hidden />
      <span className="sr-only">Identitas tidak dicantumkan</span>
    </span>
  );
}

/** Completeness as a bar plus its number. */
export function CompletenessBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const tone =
    pct >= 75
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-amber-500"
        : pct >= 25
          ? "bg-orange-500"
          : "bg-red-500";

  return (
    <div className="flex items-center gap-2" title={`Kelengkapan ${pct}%`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

/** parse_warnings, rendered as the amber chips the spec calls for. */
export function WarningChips({ warnings }: { warnings: string[] }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {warnings.map((w, i) => (
        <span
          key={`${w}-${i}`}
          className="inline-flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          {w}
        </span>
      ))}
    </div>
  );
}
