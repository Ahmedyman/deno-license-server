import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "crypto";
import { POST as activate } from "@/app/api/activate/route";
import { POST as heartbeat } from "@/app/api/heartbeat/route";
import { effectiveStatus } from "@/lib/license-status";
import { publicKeyB64 } from "@/lib/tokens";
import { POST as adminClinicAction } from "@/app/api/admin/clinics/[id]/route";
import { createClinic, getClinic } from "@/lib/clinics";
import { verifyToken, TOKEN_TTL_MS } from "@/lib/tokens";
import { resetRateLimiter } from "@/lib/rate-limit";
import { createSessionCookieValue, sessionCookieName } from "@/lib/admin-auth";
import { db, resetDb } from "@/lib/db";

/**
 * Phase D3 acceptance (docs/12 §D3), driven through the REAL route handlers:
 *  1. fresh key activation → token issued + fingerprint bound; SAME key from a
 *     DIFFERENT fingerprint → rejected (one key = one install)
 *  2. suspend via the admin route → next heartbeat carries SUSPENDED
 *  3. schema review: zero patient/clinic-operational data anywhere
 */

const FP_A = createHash("sha256").update("machine-A").digest("hex");
const FP_B = createHash("sha256").update("machine-B").digest("hex");

function post(handler: typeof activate, body: unknown, ip = "10.0.0.1"): Promise<Response> {
  return handler(
    new Request("http://test.local/api", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

function adminPost(id: string, fields: Record<string, string>): Promise<Response> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return adminClinicAction(
    new Request(`http://test.local/api/admin/clinics/${id}`, {
      method: "POST",
      headers: { cookie: `${sessionCookieName()}=${createSessionCookieValue()}` },
      body: form,
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => resetRateLimiter());
afterAll(() => resetDb());

describe("activation (docs/11 §3)", () => {
  it("fresh key → 200 token, correct payload, fingerprint bound, last_seen set", async () => {
    const { clinic, licenseKey } = await createClinic({
      name: "عيادة الأمل",
      contact: "0100000000",
      plan: "standard",
      expiresAt: null,
    });

    const res = await post(activate, {
      license_key: licenseKey,
      fingerprint: FP_A,
      clinic_name: "عيادة الأمل",
    });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const payload = verifyToken(token)!;
    expect(payload.clinic_id).toBe(clinic.id);
    expect(payload.status).toBe("ACTIVE");
    expect(payload.plan).toBe("standard");
    expect(new Date(payload.expires_at).getTime() - new Date(payload.issued_at).getTime()).toBe(
      TOKEN_TTL_MS,
    );

    const row = (await getClinic(clinic.id))!;
    expect(row.fingerprint).toBe(FP_A);
    expect(row.last_seen_at).not.toBeNull();
  });

  it("SAME key + DIFFERENT fingerprint → 409 (Iron Rule 9); same fingerprint re-activates fine", async () => {
    const { licenseKey } = await createClinic({
      name: "عيادة النور",
      contact: "",
      plan: "standard",
      expiresAt: null,
    });
    expect((await post(activate, { license_key: licenseKey, fingerprint: FP_A })).status).toBe(200);

    const second = await post(activate, { license_key: licenseKey, fingerprint: FP_B });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe("fingerprint_mismatch");

    // reinstall on the SAME machine (same fingerprint) is allowed
    expect((await post(activate, { license_key: licenseKey, fingerprint: FP_A })).status).toBe(200);
  });

  it("unknown key → 404; suspended clinic → 403; malformed body → 400", async () => {
    expect(
      (await post(activate, { license_key: "DENO-AAAA-BBBB-CCCC-DDDD", fingerprint: FP_A })).status,
    ).toBe(404);

    const { clinic, licenseKey } = await createClinic({
      name: "عيادة موقوفة",
      contact: "",
      plan: "standard",
      expiresAt: null,
    });
    await adminPost(clinic.id, { action: "suspend" });
    expect((await post(activate, { license_key: licenseKey, fingerprint: FP_A })).status).toBe(403);

    expect((await post(activate, { nope: true })).status).toBe(400);
  });
});

describe("heartbeat + suspension (docs/11 §4/§7)", () => {
  async function activated() {
    const { clinic, licenseKey } = await createClinic({
      name: "عيادة القلب",
      contact: "",
      plan: "premium",
      expiresAt: null,
    });
    const res = await post(activate, { license_key: licenseKey, fingerprint: FP_A });
    const { token } = (await res.json()) as { token: string };
    return { clinic, token };
  }

  it("valid heartbeat → FRESH token (new issue time, +25h), last_seen updated", async () => {
    const { token } = await activated();
    await new Promise((r) => setTimeout(r, 15)); // ensure a later issued_at
    const res = await post(heartbeat, { token, fingerprint: FP_A });
    expect(res.status).toBe(200);
    const fresh = verifyToken(((await res.json()) as { token: string }).token)!;
    const original = verifyToken(token)!;
    expect(new Date(fresh.issued_at).getTime()).toBeGreaterThan(
      new Date(original.issued_at).getTime(),
    );
    expect(new Date(fresh.expires_at).getTime() - new Date(fresh.issued_at).getTime()).toBe(
      TOKEN_TTL_MS,
    );
    expect(fresh.status).toBe("ACTIVE");
  });

  it("ACCEPTANCE: suspend via the admin route → next heartbeat carries SUSPENDED; reactivate → ACTIVE (no re-activation needed)", async () => {
    const { clinic, token } = await activated();

    const adminRes = await adminPost(clinic.id, { action: "suspend" });
    expect(adminRes.status).toBe(303); // redirected back to the clinic list

    const hb = await post(heartbeat, { token, fingerprint: FP_A });
    expect(hb.status).toBe(200);
    const suspended = verifyToken(((await hb.json()) as { token: string }).token)!;
    expect(suspended.status).toBe("SUSPENDED");

    await adminPost(clinic.id, { action: "reactivate" });
    const hb2 = await post(heartbeat, { token, fingerprint: FP_A });
    const restored = verifyToken(((await hb2.json()) as { token: string }).token)!;
    expect(restored.status).toBe("ACTIVE");
  });

  it("tampered token → 401; wrong fingerprint → 403", async () => {
    const { token } = await activated();
    const [p] = token.split(".");
    expect((await post(heartbeat, { token: `${p}.AAAA`, fingerprint: FP_A })).status).toBe(401);
    expect((await post(heartbeat, { token, fingerprint: FP_B })).status).toBe(403);
  });

  it("admin routes reject requests without a valid session cookie", async () => {
    const { clinic } = await activated();
    const form = new FormData();
    form.set("action", "suspend");
    const res = await adminClinicAction(
      new Request(`http://test.local/api/admin/clinics/${clinic.id}`, {
        method: "POST",
        body: form, // no cookie
      }),
      { params: Promise.resolve({ id: clinic.id }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/admin/login");
    expect((await getClinic(clinic.id))!.status).toBe("ACTIVE"); // unchanged
  });
});

describe("natural expiry vs manual suspension (docs/11 §7.1, owner decision 2026-07-19)", () => {
  async function activatedWithExpiry(expiresAt: Date | null) {
    const { clinic, licenseKey } = await createClinic({
      name: "عيادة التجربة",
      contact: "",
      plan: "standard",
      expiresAt,
    });
    const res = await post(activate, { license_key: licenseKey, fingerprint: FP_A });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    return { clinic, token };
  }

  async function heartbeatStatus(token: string): Promise<string> {
    const res = await post(heartbeat, { token, fingerprint: FP_A });
    expect(res.status).toBe(200);
    const fresh = ((await res.json()) as { token: string }).token;
    // (b) requirement: the token must verify as AUTHENTICALLY SIGNED — checked
    // against the exported public key (exactly what a Clinic Server build does)
    const payload = verifyToken(fresh, publicKeyB64());
    expect(payload).not.toBeNull();
    return payload!.status;
  }

  it("(a) manual suspend → SUSPENDED on next heartbeat (immediate-lock semantics, never EXPIRED_GRACE)", async () => {
    const { clinic, token } = await activatedWithExpiry(new Date(Date.now() + 30 * 86_400_000));
    await adminPost(clinic.id, { action: "suspend" });
    expect(await heartbeatStatus(token)).toBe("SUSPENDED");
  });

  it("(b) natural expiry → EXPIRED_GRACE on next heartbeat, token authentically signed; DB status column UNCHANGED", async () => {
    const { clinic, token } = await activatedWithExpiry(new Date(Date.now() + 30 * 86_400_000));
    expect(await heartbeatStatus(token)).toBe("ACTIVE"); // before expiry

    // the owner-facing renewal/expiry lever: the admin route's expires_at update
    await adminPost(clinic.id, { action: "update", expires_at: "2020-01-01" });
    expect(await heartbeatStatus(token)).toBe("EXPIRED_GRACE");

    // computed signal only — the stored status stays ACTIVE (exactly two DB values)
    expect((await getClinic(clinic.id))!.status).toBe("ACTIVE");
  });

  it("(c) owner extends expires_at during grace → next heartbeat back to ACTIVE (renewal = no new mechanism)", async () => {
    const { clinic, token } = await activatedWithExpiry(new Date("2020-01-01"));
    expect(await heartbeatStatus(token)).toBe("EXPIRED_GRACE");
    const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    await adminPost(clinic.id, { action: "update", expires_at: nextYear });
    expect(await heartbeatStatus(token)).toBe("ACTIVE");
  });

  it("(d) expired AND manually suspended during the grace window → SUSPENDED wins immediately", async () => {
    const { clinic, token } = await activatedWithExpiry(new Date("2020-01-01"));
    expect(await heartbeatStatus(token)).toBe("EXPIRED_GRACE"); // in grace
    await adminPost(clinic.id, { action: "suspend" }); // owner acts during grace
    expect(await heartbeatStatus(token)).toBe("SUSPENDED");
    // and reactivating while still expired returns to EXPIRED_GRACE, not ACTIVE
    await adminPost(clinic.id, { action: "reactivate" });
    expect(await heartbeatStatus(token)).toBe("EXPIRED_GRACE");
  });

  it("derivation unit checks: no expiry set → never EXPIRED_GRACE; boundary respects now", () => {
    const now = new Date("2026-07-19T12:00:00Z");
    expect(effectiveStatus({ status: "ACTIVE", expires_at: null }, now)).toBe("ACTIVE");
    expect(
      effectiveStatus({ status: "ACTIVE", expires_at: new Date("2026-07-19T11:59:59Z") }, now),
    ).toBe("EXPIRED_GRACE");
    expect(
      effectiveStatus({ status: "ACTIVE", expires_at: new Date("2026-07-19T12:00:01Z") }, now),
    ).toBe("ACTIVE");
    expect(
      effectiveStatus({ status: "SUSPENDED", expires_at: new Date("2020-01-01") }, now),
    ).toBe("SUSPENDED"); // manual always overrides
  });
});

describe("rate limiting (docs/12 D3)", () => {
  it("activate: >10/min from one IP → 429 with retry-after", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) {
      last = await post(activate, { license_key: "DENO-AAAA-BBBB-CCCC-DDDD", fingerprint: FP_A }, "9.9.9.9");
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("data-surface guarantees (docs/11 §8 + CLAUDE.md rule 1/3)", () => {
  it("ACCEPTANCE: schema review — ONE table, EXACTLY the nine specified columns, zero patient/operational data", async () => {
    const tables = await db().query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual(["licensed_clinics"]);

    const cols = await db().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'licensed_clinics' ORDER BY column_name`,
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(
      ["contact", "expires_at", "fingerprint", "id", "key_hash", "last_seen_at", "name", "plan", "status"].sort(),
    );

    // belt and braces: no column NAME anywhere in the schema smells clinical/operational
    const forbidden = /patient|visit|tooth|diagnos|treat|payment|invoice|stock|lab|photo|medical|appointment|user/i;
    for (const c of cols.rows) expect(c.column_name).not.toMatch(forbidden);
  });

  it("raw license keys are NEVER stored — only sha256 hashes", async () => {
    const { clinic, licenseKey } = await createClinic({
      name: "عيادة السلام",
      contact: "",
      plan: "standard",
      expiresAt: null,
    });
    const row = (await getClinic(clinic.id))!;
    expect(row.key_hash).toBe(createHash("sha256").update(licenseKey).digest("hex"));

    // the raw key must not appear in ANY column of ANY row
    const dump = await db().query<{ blob: string }>(`SELECT licensed_clinics::text AS blob FROM licensed_clinics`);
    for (const r of dump.rows) expect(r.blob).not.toContain(licenseKey);
  });
});
