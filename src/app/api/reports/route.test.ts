import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PAYLOADS } from "@/lib/sample-payloads";

/**
 * Exercises the ingest route against every payload in the spec.
 *
 * The database is mocked, so this proves the route's contract rather than the
 * insert: any body past the shared secret produces a stored row and a 200, and
 * nothing is ever rejected for being badly shaped. The mock captures the row
 * that *would* be written, which is what lets the sensitive-data assertions
 * below be meaningful.
 */

const TEST_SECRET = "secret-for-tests-0123456789";

/** Rows the route handed to the database during a test. */
let insertedReports: Record<string, unknown>[] = [];
let insertedEvents: Record<string, unknown>[] = [];
let failNextInsert = false;

vi.mock("@/lib/server-env", () => ({
  serverEnv: {
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role-test-key",
    intakeSecret: TEST_SECRET,
  },
  assertServiceRoleEnv: () => undefined,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (table === "reports") {
            if (failNextInsert) {
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { message: "boom" } }),
                }),
              };
            }
            insertedReports.push(row);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "00000000-0000-0000-0000-000000000001", ticket: "LP-2602-0001" },
                  error: null,
                }),
              }),
            };
          }
          insertedEvents.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

// Imported after the mocks so the route picks them up.
const { POST, GET } = await import("@/app/api/reports/route");
const { resetRateLimits } = await import("@/lib/rate-limit");

function request(body: unknown, headers: Record<string, string> = {}, ip = "10.0.0.1") {
  return new NextRequest("https://example.test/api/reports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "x-intake-secret": TEST_SECRET,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  insertedReports = [];
  insertedEvents = [];
  failNextInsert = false;
  resetRateLimits();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/reports — authentication", () => {
  it("rejects a missing secret", async () => {
    const response = await POST(request({ narrative: "halo" }, { "x-intake-secret": "" }));
    expect(response.status).toBe(401);
    expect(insertedReports).toHaveLength(0);
  });

  it("rejects a wrong secret", async () => {
    const response = await POST(request({ narrative: "halo" }, { "x-intake-secret": "nope" }));
    expect(response.status).toBe(401);
  });

  it("rejects a secret that is a prefix of the real one", async () => {
    const response = await POST(
      request({ narrative: "halo" }, { "x-intake-secret": TEST_SECRET.slice(0, 10) }),
    );
    expect(response.status).toBe(401);
  });

  it("accepts the correct secret", async () => {
    const response = await POST(request({ narrative: "halo" }));
    expect(response.status).toBe(200);
  });
});

describe("POST /api/reports — the ten spec payloads", () => {
  for (const sample of SAMPLE_PAYLOADS) {
    it(`returns 200 for: ${sample.label}`, async () => {
      const response = await POST(request(sample.payload));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ticket).toBeTruthy();
      expect(body.id).toBeTruthy();
      expect(Array.isArray(body.warnings)).toBe(true);
      expect(insertedReports).toHaveLength(1);
    });
  }

  it("payload 6 stores no NIK or account number anywhere on the row", async () => {
    const sensitive = SAMPLE_PAYLOADS.find((s) => s.label.startsWith("6"))!;
    const response = await POST(request(sensitive.payload));
    const body = await response.json();

    expect(response.status).toBe(200);

    const stored = JSON.stringify(insertedReports[0]);
    expect(stored).not.toContain("3273010101900001");
    expect(stored).not.toContain("1234567890");
    expect(JSON.stringify(insertedReports[0].payload)).not.toContain("reporter_nik");
    expect(JSON.stringify(insertedReports[0].extra)).not.toContain("nomor_rekening");

    expect(body.warnings).toContain("Data identitas sensitif ditolak: reporter_nik");
    expect(body.warnings).toContain("Data identitas sensitif ditolak: nomor_rekening");
  });

  it("payload 8 stores the full 8000-character narrative", async () => {
    const long = SAMPLE_PAYLOADS.find((s) => s.label.startsWith("8"))!;
    await POST(request(long.payload));
    expect(String(insertedReports[0].narrative)).toHaveLength(8000);
  });

  it("writes a created event for every accepted report", async () => {
    await POST(request({ narrative: "halo" }));
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0].event_type).toBe("created");
  });
});

describe("POST /api/reports — never rejects content", () => {
  it("files an unparseable body as a raw transcript, still 200", async () => {
    const response = await POST(request("halo?? ini bukan json {{{"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(insertedReports[0].raw_transcript).toBe("halo?? ini bukan json {{{");
    expect(body.warnings.some((w: string) => w.includes("bukan JSON"))).toBe(true);
  });

  it("accepts an empty body", async () => {
    const response = await POST(request(""));
    expect(response.status).toBe(200);
  });

  it("accepts a JSON array", async () => {
    const response = await POST(request([1, 2, 3]));
    expect(response.status).toBe(200);
  });

  it("accepts a bare JSON string", async () => {
    const response = await POST(request('"halo"'));
    expect(response.status).toBe(200);
  });

  it("tags the row as coming from the api", async () => {
    await POST(request({ narrative: "halo" }));
    expect(insertedReports[0].source).toBe("api");
  });

  it("returns 500 only when the database genuinely fails", async () => {
    failNextInsert = true;
    const response = await POST(request({ narrative: "halo" }));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/reports — rate limiting", () => {
  it("allows 30 requests a minute then returns 429", async () => {
    for (let i = 0; i < 30; i += 1) {
      const response = await POST(request({ narrative: `laporan ${i}` }, {}, "10.0.0.99"));
      expect(response.status).toBe(200);
    }

    const blocked = await POST(request({ narrative: "berlebih" }, {}, "10.0.0.99"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("counts each IP separately", async () => {
    for (let i = 0; i < 30; i += 1) {
      await POST(request({ narrative: `a${i}` }, {}, "10.0.0.1"));
    }
    const other = await POST(request({ narrative: "b" }, {}, "10.0.0.2"));
    expect(other.status).toBe(200);
  });
});

describe("GET /api/reports", () => {
  it("is a 405 — the endpoint is POST only", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});
