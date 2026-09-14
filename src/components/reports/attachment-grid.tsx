"use client";

import { FileText, ImageOff } from "lucide-react";
import { useState } from "react";

import { formatDateTime } from "@/lib/format";
import type { AttachmentRow } from "@/types/database";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AttachmentWithUrl = AttachmentRow & { signedUrl: string | null };

function isImage(mime: string | null) {
  return Boolean(mime?.startsWith("image/"));
}

/**
 * Evidence thumbnails.
 *
 * The URLs are signed server-side with a 60-second expiry and regenerated on
 * every request, so a link copied out of the page stops working almost
 * immediately. That is the point: this is evidence in an allegation file, and
 * it must not be sharable by URL.
 */
export function AttachmentGrid({ attachments }: { attachments: AttachmentWithUrl[] }) {
  const [active, setActive] = useState<AttachmentWithUrl | null>(null);

  if (attachments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Tidak ada lampiran pada laporan ini.</p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {attachments.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setActive(item)}
              className="group flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <div className="flex aspect-4/3 items-center justify-center bg-muted">
                {item.signedUrl && isImage(item.mime_type) ? (
                  // Signed URLs expire in 60s, so next/image optimisation would
                  // cache a URL that is dead by the time it is served.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.signedUrl}
                    alt={item.caption ?? item.file_name ?? "Lampiran bukti"}
                    className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                ) : item.signedUrl ? (
                  <FileText className="size-8 text-muted-foreground" aria-hidden />
                ) : (
                  <ImageOff className="size-8 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium">
                  {item.file_name ?? "Tanpa nama"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDateTime(item.created_at)}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">
              {active?.file_name ?? "Lampiran"}
            </DialogTitle>
            <DialogDescription>
              {active?.caption ?? "Bukti yang dilampirkan pada laporan ini."}
            </DialogDescription>
          </DialogHeader>

          {active?.signedUrl ? (
            isImage(active.mime_type) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.signedUrl}
                alt={active.caption ?? active.file_name ?? "Lampiran bukti"}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            ) : (
              <a
                href={active.signedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-4"
              >
                Buka berkas di tab baru
              </a>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Tautan lampiran tidak dapat dibuat. Muat ulang halaman untuk mencoba lagi.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
