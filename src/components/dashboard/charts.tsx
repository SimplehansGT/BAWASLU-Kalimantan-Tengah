"use client";

import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { categoryChartColor, statusChartColor } from "@/lib/format";
import type { CountPoint, DailyPoint, StackedPoint } from "@/lib/queries";

/**
 * All charts share one visual system: same grid treatment, same axis weight,
 * same tooltip, and colours drawn from the `--chart-*` tokens so light and dark
 * both work without per-chart overrides.
 */

const AXIS_PROPS = {
  stroke: "var(--muted-foreground)",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

const GRID_PROPS = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

type TooltipEntry = { name?: string; value?: number | string; color?: string };

function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined ? (
        <p className="mb-1 font-medium text-popover-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      ) : null}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums text-popover-foreground">
            {typeof entry.value === "number"
              ? entry.value.toLocaleString("id-ID")
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-56 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ------------------------------------------------------- reports per day

export function DailyReportsChart({ data }: { data: DailyPoint[] }) {
  const hasAny = data.some((d) => d.total > 0);
  if (!hasAny) return <ChartEmpty message="Belum ada laporan dalam rentang ini." />;

  const formatTick = (value: string) => format(parseISO(value), "d MMM", { locale: idLocale });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="date"
          {...AXIS_PROPS}
          tickFormatter={formatTick}
          minTickGap={24}
        />
        <YAxis {...AXIS_PROPS} allowDecimals={false} width={40} />
        <Tooltip
          content={
            <ChartTooltip
              labelFormatter={(l) =>
                format(parseISO(String(l)), "EEEE, d MMM yyyy", { locale: idLocale })
              }
            />
          }
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="total"
          name="Semua laporan"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="urgent"
          name="Urgent"
          stroke="var(--chart-4)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ----------------------------------------------------------- by category

export function CategoryChart({ data }: { data: CountPoint[] }) {
  if (data.length === 0) return <ChartEmpty message="Belum ada laporan untuk dikategorikan." />;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 40, left: -20 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="label"
          {...AXIS_PROPS}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={70}
        />
        <YAxis {...AXIS_PROPS} allowDecimals={false} width={40} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
        <Bar dataKey="count" name="Laporan" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.key} fill={categoryChartColor(entry.key)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------- by kecamatan

export function KecamatanChart({ data }: { data: CountPoint[] }) {
  if (data.length === 0) return <ChartEmpty message="Belum ada data kecamatan." />;

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30 + 40)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
      >
        <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
        <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          {...AXIS_PROPS}
          width={120}
          interval={0}
        />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
        <Bar
          dataKey="count"
          name="Laporan"
          fill="var(--chart-2)"
          radius={[0, 4, 4, 0]}
          barSize={16}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------ status donut

export function StatusDonut({ data }: { data: CountPoint[] }) {
  if (data.length === 0) return <ChartEmpty message="Belum ada laporan." />;

  const total = data.reduce((acc, d) => acc + d.count, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius={64}
            outerRadius={96}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={statusChartColor(entry.key)} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Centre label sits over the hole rather than inside the SVG, so it
          inherits the page's typography. */}
      <div className="pointer-events-none absolute inset-x-0 top-[92px] flex flex-col items-center">
        <span className="text-2xl font-semibold tabular-nums">
          {total.toLocaleString("id-ID")}
        </span>
        <span className="text-xs text-muted-foreground">laporan</span>
      </div>
    </div>
  );
}

// ------------------------------------------------- identity, by category

export function IdentityByCategoryChart({ data }: { data: StackedPoint[] }) {
  if (data.length === 0) return <ChartEmpty message="Belum ada laporan." />;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 40, left: -20 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="label"
          {...AXIS_PROPS}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={70}
        />
        <YAxis {...AXIS_PROPS} allowDecimals={false} width={40} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar
          dataKey="disclosed"
          name="Identitas dicantumkan"
          stackId="identity"
          fill="var(--chart-2)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="anonymous"
          name="Tanpa identitas"
          stackId="identity"
          fill="var(--chart-8)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------ completeness histogram

export function CompletenessChart({ data }: { data: { bucket: string; count: number }[] }) {
  const hasAny = data.some((d) => d.count > 0);
  if (!hasAny) return <ChartEmpty message="Belum ada laporan." />;

  // Low completeness is the problem case, so the scale runs red to green.
  const colors = ["var(--chart-4)", "var(--chart-3)", "var(--chart-1)", "var(--chart-2)"];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="bucket" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} allowDecimals={false} width={40} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
        <Bar dataKey="count" name="Laporan" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={entry.bucket} fill={colors[i] ?? "var(--chart-8)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
