"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the authenticated pages.
 *
 * React strips error messages from production builds and leaves only a digest,
 * which is unhelpful to whoever is actually sitting in front of this. The
 * digest is at least surfaced here so it can be quoted when reporting the
 * fault, and logged to the console so a developer opening dev tools sees it
 * without going to the hosting dashboard.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] kesalahan render:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" aria-hidden />
        </div>

        <div>
          <h1 className="text-lg font-semibold text-balance">
            Terjadi kesalahan saat memuat halaman
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Data laporan tidak hilang. Coba muat ulang halaman ini; jika masih
            gagal, sampaikan kode di bawah kepada tim teknis.
          </p>
        </div>

        {error.digest ? (
          <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-xs">
            {error.digest}
          </code>
        ) : null}

        {/* Only ever populated in development — production strips it. */}
        {process.env.NODE_ENV === "development" && error.message ? (
          <pre className="max-h-48 w-full overflow-auto rounded-md border bg-muted p-3 text-left font-mono text-xs">
            {error.message}
          </pre>
        ) : null}

        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RotateCw className="size-4" aria-hidden />
            Coba lagi
          </Button>
          <Button variant="outline" render={<Link href="/reports" />}>
            Buka daftar laporan
          </Button>
        </div>
      </div>
    </div>
  );
}
