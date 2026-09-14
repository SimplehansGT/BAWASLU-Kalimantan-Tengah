import { describe, expect, it } from "vitest";

import {
  normalizeBoolean,
  normalizeCategory,
  normalizeDate,
  normalizeInteger,
  normalizeNumber,
  normalizePriority,
  normalizeReport,
  stripSensitive,
} from "@/lib/normalize";

/**
 * Fixed clock so relative-date assertions are stable: Sun 15 Feb 2026, 12:00
 * *local time*. Built from local components on purpose — relative terms like
 * "kemarin" resolve against the reporter's own day, so a UTC-pinned clock would
 * make these tests pass or fail depending on the machine's timezone.
 */
const NOW = new Date(2026, 1, 15, 12, 0, 0);

/** Local calendar day of an ISO string, for the same timezone reason. */
const dayOf = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ============================================================ normalizeCategory

describe("normalizeCategory", () => {
  it("maps plain bucket names through untouched", () => {
    expect(normalizeCategory("politik_uang").value).toBe("politik_uang");
    expect(normalizeCategory("intimidasi_kekerasan").value).toBe("intimidasi_kekerasan");
  });

  it("matches Indonesian keywords onto buckets", () => {
    expect(normalizeCategory("politik uang").value).toBe("politik_uang");
    expect(normalizeCategory("bagi-bagi sembako").value).toBe("politik_uang");
    expect(normalizeCategory("serangan fajar").value).toBe("politik_uang");
    expect(normalizeCategory("intimidasi").value).toBe("intimidasi_kekerasan");
    expect(normalizeCategory("diancam dipecat").value).toBe("intimidasi_kekerasan");
    expect(normalizeCategory("mobil dinas dipakai kampanye").value).toBe(
      "penyalahgunaan_fasilitas",
    );
    expect(normalizeCategory("baliho di masa tenang").value).toBe("pelanggaran_kampanye");
    expect(normalizeCategory("surat suara tertukar").value).toBe("pelanggaran_pemungutan");
    expect(normalizeCategory("kode etik penyelenggara").value).toBe("kode_etik");
  });

  it("handles the messy spellings the intake actually produces", () => {
    expect(normalizeCategory("kayanya money politic").value).toBe("politik_uang");
    expect(normalizeCategory("bagi2 amplop").value).toBe("politik_uang");
    expect(normalizeCategory("POLITIK UANG!!!").value).toBe("politik_uang");
  });

  it("prefers the longest matching keyword when buckets collide", () => {
    // "bukan pelanggaran" must not be filed as a campaign violation just
    // because the word "pelanggaran" appears.
    expect(normalizeCategory("bukan pelanggaran, cuma salah paham").value).toBe(
      "bukan_pelanggaran",
    );
  });

  it("falls back to lainnya with a warning, never null", () => {
    const result = normalizeCategory("zzzz qqqq wwww");
    expect(result.value).toBe("lainnya");
    expect(result.warning).toBeTruthy();
  });

  it("treats missing input as lainnya with a warning", () => {
    for (const input of [null, undefined, "", "   "]) {
      const result = normalizeCategory(input);
      expect(result.value).toBe("lainnya");
      expect(result.warning).toBeTruthy();
    }
  });

  it("never throws on hostile input", () => {
    const nasty: unknown[] = [123, true, [], {}, Symbol("x"), () => null, NaN, Infinity];
    for (const input of nasty) {
      expect(() => normalizeCategory(input)).not.toThrow();
      expect(normalizeCategory(input).value).not.toBeNull();
    }
  });
});

// ================================================================ normalizeDate

describe("normalizeDate", () => {
  it("parses ISO with an offset", () => {
    const result = normalizeDate("2026-02-11T20:30:00+07:00", NOW);
    expect(result.value).toBe("2026-02-11T13:30:00.000Z");
    expect(result.warning).toBeUndefined();
  });

  it("parses bare ISO dates", () => {
    expect(dayOf(normalizeDate("2026-01-05", NOW).value)).toBe("2026-01-05");
  });

  it("parses DD/MM/YYYY and DD-MM-YYYY as day-first", () => {
    expect(dayOf(normalizeDate("05/01/2026", NOW).value)).toBe("2026-01-05");
    expect(dayOf(normalizeDate("05-01-2026", NOW).value)).toBe("2026-01-05");
    // 11/02 is 11 February, not 2 November.
    expect(dayOf(normalizeDate("11/02/2026", NOW).value)).toBe("2026-02-11");
  });

  it("rejects impossible calendar dates rather than rolling them over", () => {
    const result = normalizeDate("31/02/2026", NOW);
    expect(result.value).toBeNull();
    expect(result.warning).toBeTruthy();
  });

  it("parses Indonesian relative terms", () => {
    expect(dayOf(normalizeDate("kemarin", NOW).value)).toBe("2026-02-14");
    expect(dayOf(normalizeDate("kemaren", NOW).value)).toBe("2026-02-14");
    expect(dayOf(normalizeDate("tadi malam", NOW).value)).toBe("2026-02-14");
    expect(dayOf(normalizeDate("td malem", NOW).value)).toBe("2026-02-14");
    expect(dayOf(normalizeDate("2 hari lalu", NOW).value)).toBe("2026-02-13");
    expect(dayOf(normalizeDate("3 hari yang lalu", NOW).value)).toBe("2026-02-12");
    expect(dayOf(normalizeDate("minggu lalu", NOW).value)).toBe("2026-02-08");
    expect(dayOf(normalizeDate("seminggu lalu", NOW).value)).toBe("2026-02-08");
    expect(dayOf(normalizeDate("hari ini", NOW).value)).toBe("2026-02-15");
  });

  it("accepts a future date but warns about it", () => {
    const result = normalizeDate("2027-12-31", NOW);
    expect(result.value).not.toBeNull();
    expect(result.warning).toMatch(/masa depan/i);
  });

  it("warns on future relative terms too", () => {
    const result = normalizeDate("besok", NOW);
    expect(result.value).not.toBeNull();
    expect(result.warning).toMatch(/masa depan/i);
  });

  it("returns null plus a warning for unparseable text", () => {
    const result = normalizeDate("entah kapan ya lupa", NOW);
    expect(result.value).toBeNull();
    expect(result.warning).toBeTruthy();
  });

  it("returns a clean null for absent input", () => {
    expect(normalizeDate(null, NOW)).toEqual({ value: null });
    expect(normalizeDate(undefined, NOW)).toEqual({ value: null });
    expect(normalizeDate("", NOW)).toEqual({ value: null });
  });

  it("never throws on hostile input", () => {
    const nasty: unknown[] = [{}, [], true, NaN, Infinity, Symbol("x"), new Date("nope")];
    for (const input of nasty) {
      expect(() => normalizeDate(input, NOW)).not.toThrow();
    }
  });
});

// ============================================================== normalizeNumber

describe("normalizeNumber", () => {
  it("passes clean numbers through", () => {
    expect(normalizeNumber(50000).value).toBe(50000);
    expect(normalizeNumber(0).value).toBe(0);
  });

  it("strips currency markers and Indonesian thousands separators", () => {
    expect(normalizeNumber("Rp 50.000").value).toBe(50000);
    expect(normalizeNumber("Rp 100.000,-").value).toBe(100000);
    expect(normalizeNumber("IDR 1.234.567").value).toBe(1234567);
    expect(normalizeNumber("  50000  ").value).toBe(50000);
  });

  it("expands Indonesian magnitude words", () => {
    expect(normalizeNumber("50rb").value).toBe(50000);
    expect(normalizeNumber("50 ribu").value).toBe(50000);
    expect(normalizeNumber("50k").value).toBe(50000);
    expect(normalizeNumber("2jt").value).toBe(2_000_000);
    expect(normalizeNumber("2 juta").value).toBe(2_000_000);
    expect(normalizeNumber("1,5jt").value).toBe(1_500_000);
    expect(normalizeNumber("3 miliar").value).toBe(3_000_000_000);
  });

  it("takes the lower bound of a range and warns", () => {
    const result = normalizeNumber("50-100rb");
    expect(result.value).toBe(50000);
    expect(result.warning).toMatch(/rentang/i);

    const worded = normalizeNumber("50 sampai 100 ribu");
    expect(worded.value).toBe(50000);
    expect(worded.warning).toMatch(/rentang/i);
  });

  it("returns null plus a warning for text with no digits", () => {
    const result = normalizeNumber("banyak banget");
    expect(result.value).toBeNull();
    expect(result.warning).toBeTruthy();
  });

  it("returns a clean null for absent input", () => {
    expect(normalizeNumber(null)).toEqual({ value: null });
    expect(normalizeNumber(undefined)).toEqual({ value: null });
    expect(normalizeNumber("")).toEqual({ value: null });
  });

  it("never throws on hostile input", () => {
    const nasty: unknown[] = [{}, [], true, NaN, Infinity, -Infinity, Symbol("x")];
    for (const input of nasty) {
      expect(() => normalizeNumber(input)).not.toThrow();
    }
  });

  it("rounds for count columns", () => {
    expect(normalizeInteger("40,6").value).toBe(41);
    expect(normalizeInteger("banyak").value).toBeNull();
  });
});

// ============================================================= normalizeBoolean

describe("normalizeBoolean", () => {
  it("passes booleans through", () => {
    expect(normalizeBoolean(true).value).toBe(true);
    expect(normalizeBoolean(false).value).toBe(false);
  });

  it("reads Indonesian yes and no words", () => {
    for (const yes of ["ya", "iya", "Ya", "YA", "benar", "ada", "sudah", "1", "true"]) {
      expect(normalizeBoolean(yes).value).toBe(true);
    }
    for (const no of ["tidak", "gak", "nggak", "belum", "bukan", "0", "false"]) {
      expect(normalizeBoolean(no).value).toBe(false);
    }
  });

  it("reads whole phrases", () => {
    expect(normalizeBoolean("tidak ada bukti").value).toBe(false);
    expect(normalizeBoolean("ada bukti foto").value).toBe(true);
  });

  it("treats numbers as truthiness", () => {
    expect(normalizeBoolean(1).value).toBe(true);
    expect(normalizeBoolean(0).value).toBe(false);
  });

  it("returns null plus a warning when it genuinely cannot tell", () => {
    const result = normalizeBoolean("mungkin lah");
    expect(result.value).toBeNull();
    expect(result.warning).toBeTruthy();
  });

  it("never throws on hostile input", () => {
    for (const input of [{}, [], NaN, Symbol("x"), () => null]) {
      expect(() => normalizeBoolean(input)).not.toThrow();
    }
  });
});

// ============================================================ normalizePriority

describe("normalizePriority", () => {
  it("reads the two canonical values", () => {
    expect(normalizePriority("normal").value).toBe("normal");
    expect(normalizePriority("urgent").value).toBe("urgent");
  });

  it("reads emphatic and Indonesian forms as urgent", () => {
    expect(normalizePriority("SANGAT URGENT").value).toBe("urgent");
    expect(normalizePriority("mendesak").value).toBe("urgent");
    expect(normalizePriority("darurat").value).toBe("urgent");
    expect(normalizePriority("segera").value).toBe("urgent");
  });

  it("reads 'biasa' as normal", () => {
    expect(normalizePriority("biasa").value).toBe("normal");
  });

  it("defaults to normal with a warning when unrecognised", () => {
    const result = normalizePriority("warna biru");
    expect(result.value).toBe("normal");
    expect(result.warning).toBeTruthy();
  });

  it("never throws on hostile input", () => {
    for (const input of [{}, [], 42, NaN, Symbol("x")]) {
      expect(() => normalizePriority(input)).not.toThrow();
    }
  });
});

// ============================================================== stripSensitive

describe("stripSensitive", () => {
  it("removes identity and account keys at any depth", () => {
    const warnings: string[] = [];
    const result = stripSensitive(
      {
        reporter_name: "Siti",
        reporter_nik: "3273010101900001",
        nomor_rekening: "1234567890",
        nested: { ktp_scan: "x", npwp: "y", keep: "z" },
        list: [{ passport_no: "A123", ok: 1 }],
      },
      warnings,
    ) as Record<string, unknown>;

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("3273010101900001");
    expect(serialised).not.toContain("1234567890");
    expect(serialised).not.toContain("A123");
    expect(result.reporter_name).toBe("Siti");
    expect((result.nested as Record<string, unknown>).keep).toBe("z");
    expect(warnings.some((w) => w.startsWith("Data identitas sensitif ditolak:"))).toBe(true);
  });

  it("survives circular structures", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => stripSensitive(circular, [])).not.toThrow();
  });
});

// ============================================================== normalizeReport

describe("normalizeReport — the ten intake payloads from the spec", () => {
  it("1. clean and complete", () => {
    const { row, warnings } = normalizeReport(
      {
        narrative:
          "Ada pembagian uang Rp 50.000 per orang di RT 03 sambil diminta memilih calon nomor 2.",
        incident_at: "2026-02-11T20:30:00+07:00",
        desa: "Sukamaju",
        kecamatan: "Cibiru",
        kabupaten: "Bandung",
        category: "politik uang",
        item_given: "uang tunai",
        item_value: 50000,
        recipients_estimate: 40,
        witness_count: 3,
        has_evidence: true,
        identity_disclosed: true,
        reporter_name: "Budi Santoso",
        reporter_address: "Sukamaju, Cibiru",
        reporter_contact: "0812xxxxxxx",
      },
      NOW,
    );

    expect(row.category).toBe("politik_uang");
    expect(row.category_raw).toBe("politik uang");
    expect(row.item_value).toBe(50000);
    expect(row.recipients_estimate).toBe(40);
    expect(row.witness_count).toBe(3);
    expect(row.has_evidence).toBe(true);
    expect(row.identity_disclosed).toBe(true);
    expect(row.kecamatan).toBe("Cibiru");
    expect(row.incident_at).toBe("2026-02-11T13:30:00.000Z");
    expect(warnings).toEqual([]);
  });

  it("2. minimum viable — a single line of text still produces a row", () => {
    const { row } = normalizeReport({ narrative: "bagi bagi duit di kampung" }, NOW);
    expect(row.narrative).toBe("bagi bagi duit di kampung");
    expect(row.extra).toEqual({});
  });

  it("3. messy Indonesian, relative time, fuzzy value", () => {
    const { row } = normalizeReport(
      {
        narrative: "td malem ada yg bagi2 amplop abis isya deket masjid",
        incident_at_text: "tadi malam",
        location_text: "deket masjid al ikhlas",
        item_value_text: "50rban kayaknya",
        category: "kayanya money politic",
      },
      NOW,
    );

    expect(row.category).toBe("politik_uang");
    expect(row.category_raw).toBe("kayanya money politic");
    expect(row.incident_at_text).toBe("tadi malam");
    expect(row.item_value_text).toBe("50rban kayaknya");
    expect(row.location_text).toBe("deket masjid al ikhlas");
  });

  it("4. unknown fields land in extra rather than erroring", () => {
    const { row } = normalizeReport(
      {
        narrative: "Sembako dibagikan sambil kampanye.",
        kecamatan: "Lembang",
        cuaca: "hujan",
        nomor_tps: "TPS 14",
        mood_pelapor: "marah",
        random_field_from_ai: { nested: true, count: 7 },
      },
      NOW,
    );

    expect(row.kecamatan).toBe("Lembang");
    expect(row.extra).toEqual({
      cuaca: "hujan",
      nomor_tps: "TPS 14",
      mood_pelapor: "marah",
      random_field_from_ai: { nested: true, count: 7 },
    });
  });

  it("5. every field the wrong type — coerces or warns, never throws", () => {
    let result!: ReturnType<typeof normalizeReport>;
    expect(() => {
      result = normalizeReport(
        {
          narrative: 12345,
          witness_count: "banyak banget",
          item_value: "Rp 100.000,-",
          identity_disclosed: "iya",
          incident_at: "kemarin",
          priority: "SANGAT URGENT",
        },
        NOW,
      );
    }).not.toThrow();

    expect(result.row.narrative).toBe("12345");
    expect(result.row.witness_count).toBeUndefined();
    expect(result.row.item_value).toBe(100000);
    expect(result.row.identity_disclosed).toBe(true);
    expect(dayOf(result.row.incident_at ?? null)).toBe("2026-02-14");
    expect(result.row.incident_at_text).toBe("kemarin");
    expect(result.row.priority).toBe("urgent");
    // The unreadable witness count is reported rather than silently ignored.
    expect(result.warnings.some((w) => w.includes("witness_count"))).toBe(true);
  });

  it("6. sensitive identity data is stripped from row, extra AND payload", () => {
    const { row, warnings } = normalizeReport(
      {
        narrative: "Saya melihat pembagian uang.",
        reporter_name: "Siti",
        reporter_nik: "3273010101900001",
        nomor_rekening: "1234567890",
      },
      NOW,
    );

    // The values must not survive anywhere on the row.
    const everything = JSON.stringify(row);
    expect(everything).not.toContain("3273010101900001");
    expect(everything).not.toContain("1234567890");

    // Nor must the keys survive in the two places that persist intake data.
    // (The warning text names the rejected key on purpose — that is the
    // spec'd message format — so it is excluded from this check.)
    const stored = JSON.stringify({ payload: row.payload, extra: row.extra });
    expect(stored).not.toContain("reporter_nik");
    expect(stored).not.toContain("nomor_rekening");

    expect(row.reporter_name).toBe("Siti");
    expect(warnings).toContain("Data identitas sensitif ditolak: reporter_nik");
    expect(warnings).toContain("Data identitas sensitif ditolak: nomor_rekening");
  });

  it("7. transcript-only payload still produces a row", () => {
    const { row } = normalizeReport({ raw_transcript: "halo?? ini gimana ya" }, NOW);
    expect(row.raw_transcript).toBe("halo?? ini gimana ya");
    expect(row.narrative).toBeUndefined();
  });

  it("8. a very long narrative is not truncated", () => {
    const long = "a".repeat(8000);
    const { row } = normalizeReport({ narrative: long }, NOW);
    expect(row.narrative).toHaveLength(8000);
  });

  it("9. urgent path", () => {
    const { row } = normalizeReport(
      {
        narrative: "Saya diancam akan dipecat kalau tidak memilih calon tertentu.",
        category: "intimidasi",
        priority: "urgent",
        kecamatan: "Cicendo",
      },
      NOW,
    );
    expect(row.category).toBe("intimidasi_kekerasan");
    expect(row.priority).toBe("urgent");
    expect(row.kecamatan).toBe("Cicendo");
  });

  it("10. a future date warns but is not rejected", () => {
    const { row, warnings } = normalizeReport(
      { narrative: "Kejadian pembagian sembako.", incident_at: "2027-12-31" },
      NOW,
    );
    expect(row.incident_at).not.toBeNull();
    expect(warnings.some((w) => /masa depan/i.test(w))).toBe(true);
  });
});

describe("normalizeReport — general contract", () => {
  it("keeps the original payload alongside the parsed row", () => {
    const { row } = normalizeReport({ narrative: "halo", cuaca: "hujan" }, NOW);
    expect(row.payload).toEqual({ narrative: "halo", cuaca: "hujan" });
  });

  it("records its warnings onto the row", () => {
    const { row, warnings } = normalizeReport({ category: "zzzz qqqq" }, NOW);
    expect(row.parse_warnings).toEqual(warnings);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("never throws, whatever it is handed", () => {
    const nasty: unknown[] = [
      null,
      undefined,
      "",
      "just a string",
      42,
      true,
      [],
      [1, 2, 3],
      {},
      { narrative: null },
      { narrative: { deeply: { nested: [1, { x: 2 }] } } },
      { incident_at: {} },
      { item_value: [] },
      { priority: 99 },
      { extra: "not an object" },
      new Date(),
    ];

    for (const input of nasty) {
      expect(() => normalizeReport(input, NOW)).not.toThrow();
      const { row } = normalizeReport(input, NOW);
      expect(row).toBeTypeOf("object");
      expect(Array.isArray(row.parse_warnings)).toBe(true);
    }
  });

  it("survives a circular payload", () => {
    const circular: Record<string, unknown> = { narrative: "halo" };
    circular.self = circular;
    expect(() => normalizeReport(circular, NOW)).not.toThrow();
  });

  it("does not invent values for keys the intake never sent", () => {
    const { row } = normalizeReport({ narrative: "halo" }, NOW);
    expect(row.category).toBeUndefined();
    expect(row.incident_at).toBeUndefined();
    expect(row.priority).toBeUndefined();
    expect(row.identity_disclosed).toBeUndefined();
  });
});
