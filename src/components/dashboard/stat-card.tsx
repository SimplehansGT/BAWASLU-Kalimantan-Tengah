import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ElementType;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClass = {
    default: "text-foreground",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    success: "text-emerald-600 dark:text-emerald-400",
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground text-pretty">{hint}</p>
          ) : null}
        </div>
        {Icon ? <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </CardContent>
    </Card>
  );
}
