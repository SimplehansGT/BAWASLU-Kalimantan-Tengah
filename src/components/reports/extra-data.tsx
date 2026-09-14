"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { Json } from "@/types/database";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

function renderValue(value: Json): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

/**
 * `extra` holds every key the schema did not anticipate. It is rendered as a
 * plain table rather than hidden behind the JSON view, because the fields the
 * AI invents today are the columns worth adding tomorrow.
 */
export function ExtraData({ extra }: { extra: Json }) {
  const [open, setOpen] = useState(false);

  const entries =
    extra && typeof extra === "object" && !Array.isArray(extra)
      ? Object.entries(extra as Record<string, Json>)
      : [];

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Tidak ada data tambahan di luar kolom baku.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="divide-y rounded-md border">
        {entries.map(([key, value]) => {
          const rendered = renderValue(value);
          const isMultiline = rendered.includes("\n");
          return (
            <div key={key} className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-3 sm:gap-3">
              <dt className="font-mono text-xs break-all text-muted-foreground">{key}</dt>
              <dd className="sm:col-span-2">
                {isMultiline ? (
                  <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                    {rendered}
                  </pre>
                ) : (
                  <span className="text-sm break-words">{rendered}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          render={
            <Button variant="ghost" size="sm" className="gap-1.5 px-2">
              <ChevronDown
                className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
              Lihat JSON mentah
            </Button>
          }
        />
        <CollapsibleContent>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
            {JSON.stringify(extra, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** The verbatim transcript, collapsed by default. */
export function RawTranscript({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <ChevronDown
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
            {open ? "Sembunyikan transkrip asli" : "Lihat transkrip asli"}
          </Button>
        }
      />
      <CollapsibleContent>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
          {transcript}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
