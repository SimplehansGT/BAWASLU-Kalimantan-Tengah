"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { CATEGORIES, CATEGORY_LABELS, STATUSES, STATUS_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export type FilterOptions = { kabupaten: string[]; kecamatan: string[] };

/**
 * Writes every filter into the URL rather than component state, which is what
 * makes a filtered view shareable and survivable across a reload.
 */
export function ReportFilters({
  options,
  showSearch = true,
  showListOnly = true,
}: {
  options: FilterOptions;
  showSearch?: boolean;
  /** Filters that only make sense on the list page, not the dashboard. */
  showListOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  // Keep the box in step when the URL changes from somewhere else (back button,
  // "reset filter").
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === ALL) next.delete(key);
      else next.set(key, value);
    }
    // Any filter change invalidates the current page number.
    next.delete("page");

    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    update({ q: query.trim() || null });
  }

  const activeCount = [
    "from",
    "to",
    "kabupaten",
    "kecamatan",
    "category",
    "status",
    "priority",
    "identitas",
    "bukti",
    "q",
    "arsip",
  ].filter((k) => searchParams.get(k)).length;

  const value = (key: string) => searchParams.get(key) ?? ALL;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      {showSearch ? (
        <form onSubmit={onSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari uraian, lokasi, terlapor, atau nomor tiket…"
              className="pl-9"
              aria-label="Cari laporan"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={isPending}>
            Cari
          </Button>
        </form>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Dari tanggal</Label>
          <Input
            type="date"
            value={searchParams.get("from") ?? ""}
            onChange={(e) => update({ from: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Sampai tanggal</Label>
          <Input
            type="date"
            value={searchParams.get("to") ?? ""}
            onChange={(e) => update({ to: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Kabupaten/Kota</Label>
          <Select value={value("kabupaten")} onValueChange={(v) => update({ kabupaten: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Semua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua kabupaten/kota</SelectItem>
              {options.kabupaten.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Kecamatan</Label>
          <Select value={value("kecamatan")} onValueChange={(v) => update({ kecamatan: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Semua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua kecamatan</SelectItem>
              {options.kecamatan.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Kategori</Label>
          <Select value={value("category")} onValueChange={(v) => update({ category: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Semua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua kategori</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={value("status")} onValueChange={(v) => update({ status: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Semua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Prioritas</Label>
          <Select value={value("priority")} onValueChange={(v) => update({ priority: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Semua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua prioritas</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showListOnly ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Identitas pelapor</Label>
              <Select value={value("identitas")} onValueChange={(v) => update({ identitas: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Semua</SelectItem>
                  <SelectItem value="1">Dicantumkan</SelectItem>
                  <SelectItem value="0">Tidak dicantumkan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Bukti</Label>
              <Select value={value("bukti")} onValueChange={(v) => update({ bukti: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Semua</SelectItem>
                  <SelectItem value="1">Ada bukti</SelectItem>
                  <SelectItem value="0">Tanpa bukti</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Arsip</Label>
              <Select value={value("arsip")} onValueChange={(v) => update({ arsip: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Sembunyikan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Sembunyikan arsip</SelectItem>
                  <SelectItem value="1">Termasuk arsip</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}
      </div>

      {activeCount > 0 ? (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {activeCount} filter aktif
            {isPending ? " · memuat…" : ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startTransition(() => router.push(pathname))}
          >
            <X className="size-4" aria-hidden />
            Hapus semua filter
          </Button>
        </div>
      ) : null}
    </div>
  );
}
