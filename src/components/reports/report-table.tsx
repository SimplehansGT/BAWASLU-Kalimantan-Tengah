"use client";

import { Archive, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { archiveReportsAction, bulkUpdateStatusAction } from "@/lib/actions";
import { STATUSES, STATUS_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportRow } from "@/types/database";
import { EmptyState } from "@/components/page-header";
import { ConfirmDialog } from "@/components/reports/confirm-dialog";
import {
  CategoryBadge,
  CompletenessBar,
  IdentityIcon,
  PriorityBadge,
  StatusBadge,
} from "@/components/reports/report-badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EM_DASH = "—";

export function ReportTable({
  rows,
  total,
  page,
  pageCount,
}: {
  rows: ReportRow[];
  total: number;
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  async function applyStatus(status: string) {
    const result = await bulkUpdateStatusAction(selectedIds, status);
    if (result.ok) {
      toast.success(
        `${result.data.updated} laporan diperbarui menjadi "${STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}".`,
      );
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function onStatusChange(status: string | null) {
    if (!status) return;
    // Closing a report is the one status change that needs a second look.
    if (status === "ditutup") {
      setPendingStatus(status);
      return;
    }
    void applyStatus(status);
  }

  async function onArchive() {
    const result = await archiveReportsAction(selectedIds, true);
    if (result.ok) {
      toast.success(`${result.data.updated} laporan diarsipkan.`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function exportHref() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const qs = params.toString();
    return `/api/export${qs ? `?${qs}` : ""}`;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Belum ada laporan yang masuk."
        description="Laporan yang diterima melalui formulir atau kanal intake akan muncul di sini."
        action={
          <Button render={<Link href="/reports/new" />} size="sm">
            Catat laporan baru
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bulk action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {selected.size > 0 ? (
            <>
              <span className="text-sm font-medium">{selected.size} dipilih</span>

              <Select value="" onValueChange={onStatusChange}>
                <SelectTrigger size="sm" className="w-48">
                  <SelectValue placeholder="Ubah status…" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
                <Archive className="size-4" aria-hidden />
                Arsipkan
              </Button>

              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Batal pilih
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {total.toLocaleString("id-ID")} laporan
            </p>
          )}
        </div>

        <Button variant="outline" size="sm" render={<a href={exportHref()} />}>
          Ekspor CSV
        </Button>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Pilih semua laporan di halaman ini"
                />
              </TableHead>
              <TableHead>Tiket</TableHead>
              <TableHead>Tanggal masuk</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Kecamatan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prioritas</TableHead>
              <TableHead>Kelengkapan</TableHead>
              <TableHead className="text-center">Identitas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  "group",
                  // Urgent rows carry a left accent so they read as different
                  // at a glance, not just by badge.
                  row.priority === "urgent" && "border-l-2 border-l-destructive",
                  row.is_archived && "opacity-60",
                )}
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggleOne(row.id)}
                    aria-label={`Pilih laporan ${row.ticket}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/reports/${row.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {row.ticket}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(row.created_at)}
                </TableCell>
                <TableCell>
                  <CategoryBadge value={row.category} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.kecamatan?.trim() || EM_DASH}
                </TableCell>
                <TableCell>
                  <StatusBadge value={row.status} />
                </TableCell>
                <TableCell>
                  <PriorityBadge value={row.priority} />
                </TableCell>
                <TableCell>
                  <CompletenessBar value={row.completeness} />
                </TableCell>
                <TableCell className="text-center">
                  <IdentityIcon disclosed={row.identity_disclosed} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "rounded-lg border bg-card p-4",
              row.priority === "urgent" && "border-l-2 border-l-destructive",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.has(row.id)}
                  onCheckedChange={() => toggleOne(row.id)}
                  aria-label={`Pilih laporan ${row.ticket}`}
                  className="mt-1"
                />
                <div className="min-w-0">
                  <Link href={`/reports/${row.id}`} className="font-medium hover:underline">
                    {row.ticket}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </p>
                </div>
              </div>
              <IdentityIcon disclosed={row.identity_disclosed} />
            </div>

            {row.narrative ? (
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground text-pretty">
                {row.narrative}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CategoryBadge value={row.category} />
              <StatusBadge value={row.status} />
              <PriorityBadge value={row.priority} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {row.kecamatan?.trim() || "Kecamatan belum diisi"}
              </span>
              <CompletenessBar value={row.completeness} />
            </div>
          </li>
        ))}
      </ul>

      {/* Pagination */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Halaman {page} dari {pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || isPending}
              onClick={() => goToPage(page + 1)}
            >
              Berikutnya
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
        title="Tutup laporan terpilih?"
        description={`${selected.size} laporan akan ditandai sebagai ditutup. Perubahan ini tercatat dalam jejak audit dan dapat dikembalikan dengan mengubah status kembali.`}
        confirmLabel="Ya, tutup laporan"
        onConfirm={async () => {
          if (pendingStatus) await applyStatus(pendingStatus);
          setPendingStatus(null);
        }}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Arsipkan laporan terpilih?"
        description={`${selected.size} laporan akan disembunyikan dari daftar utama. Data tidak dihapus dan masih dapat ditampilkan melalui filter arsip.`}
        confirmLabel="Ya, arsipkan"
        destructive
        onConfirm={onArchive}
      />
    </div>
  );
}
