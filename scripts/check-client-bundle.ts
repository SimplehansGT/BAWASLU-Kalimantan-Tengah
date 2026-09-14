/**
 * Build-time assertion: the service role key never reaches the browser.
 *
 * `server-only` already makes a direct import from a "use client" file a
 * compile error, but it cannot catch every route to a leak — a value passed
 * down as a prop, or a stray `process.env` read in shared code that happens to
 * get bundled. This runs after `next build` and checks the two things that
 * actually matter:
 *
 *   1. No file marked "use client" mentions the variable or imports a module
 *      that holds it.
 *   2. The key's literal value does not appear in any emitted client asset.
 *
 * Exits non-zero on a finding, which fails the build.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const CLIENT_ASSETS = join(ROOT, ".next", "static");

const FORBIDDEN_IN_CLIENT = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "@/lib/server-env",
  "@/lib/supabase/admin",
];

type Finding = { file: string; detail: string };

function walk(dir: string, extensions?: string[]): string[] {
  let out: string[] = [];
  let entries: string[];

  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out = out.concat(walk(full, extensions));
    } else if (!extensions || extensions.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function checkClientSources(): Finding[] {
  const findings: Finding[] = [];

  for (const file of walk(SRC, [".ts", ".tsx", ".js", ".jsx"])) {
    const contents = readFileSync(file, "utf8");

    // Only the directive at the very top of a file makes it a client module.
    const head = contents.slice(0, 200);
    const isClient = /^\s*(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(head);
    if (!isClient) continue;

    for (const needle of FORBIDDEN_IN_CLIENT) {
      if (contents.includes(needle)) {
        findings.push({
          file: relative(ROOT, file),
          detail: `file bertanda "use client" menyebut ${needle}`,
        });
      }
    }
  }

  return findings;
}

function checkBuiltAssets(): Finding[] {
  const findings: Finding[] = [];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Nothing to search for if the key is not configured in this environment.
  // The source-level check above still runs, so this is a soft skip.
  if (!key || key.length < 20) {
    console.log(
      "  › SUPABASE_SERVICE_ROLE_KEY tidak diset; pemeriksaan isi bundel dilewati.",
    );
    return findings;
  }

  const assets = walk(CLIENT_ASSETS);
  if (assets.length === 0) {
    console.log("  › Tidak ada aset klien di .next/static; jalankan setelah next build.");
    return findings;
  }

  for (const file of assets) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue; // binary asset
    }
    if (contents.includes(key)) {
      findings.push({
        file: relative(ROOT, file),
        detail: "nilai SUPABASE_SERVICE_ROLE_KEY ditemukan di bundel klien",
      });
    }
  }

  console.log(`  › ${assets.length} aset klien diperiksa.`);
  return findings;
}

function main() {
  console.log("\nMemeriksa kebocoran kunci service role…");

  const findings = [...checkClientSources(), ...checkBuiltAssets()];

  if (findings.length > 0) {
    console.error("\n  GAGAL — kunci service role berpotensi bocor ke klien:\n");
    for (const f of findings) console.error(`  ✗ ${f.file}\n    ${f.detail}`);
    console.error(
      "\n  Kunci ini melewati seluruh row level security. Perbaiki sebelum deploy,\n" +
        "  dan rotasi kuncinya jika build ini sempat dipublikasikan.\n",
    );
    process.exit(1);
  }

  console.log("  ✓ Aman: kunci service role tidak ditemukan di sisi klien.\n");
}

main();
