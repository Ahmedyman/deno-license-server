import { describe, it, expect } from "vitest";
import {
  LICENSE_KEY_REGEX,
  generateLicenseKey,
  licenseKeyHash,
  normalizeLicenseKey,
} from "@/lib/license-keys";
import { TOKEN_TTL_MS, issueToken, publicKeyB64, verifyToken } from "@/lib/tokens";
import { rateLimit, resetRateLimiter } from "@/lib/rate-limit";
import {
  createSessionCookieValue,
  isValidSessionCookieValue,
  verifyAdminPassword,
} from "@/lib/admin-auth";

describe("license keys (docs/11 §2)", () => {
  it("generates DENO-XXXX-XXXX-XXXX-XXXX base32 keys, all distinct", () => {
    const keys = Array.from({ length: 200 }, generateLicenseKey);
    for (const k of keys) expect(k).toMatch(LICENSE_KEY_REGEX);
    expect(new Set(keys).size).toBe(200);
  });

  it("hash is sha256 of the normalized key — tolerant of case/whitespace", () => {
    const key = generateLicenseKey();
    expect(licenseKeyHash(`  ${key.toLowerCase()}  `)).toBe(licenseKeyHash(key));
    expect(licenseKeyHash(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizeLicenseKey(" deno-abcd ")).toBe("DENO-ABCD");
  });
});

describe("tokens (docs/11 §3/§4)", () => {
  const clinic = { id: "11111111-2222-3333-4444-555555555555", plan: "standard", status: "ACTIVE" as const };

  it("sign → verify roundtrip; expires_at is ALWAYS issued_at + 25h", () => {
    const t0 = new Date("2026-07-19T12:00:00.000Z");
    const token = issueToken(clinic, t0);
    const payload = verifyToken(token)!;
    expect(payload).not.toBeNull();
    expect(payload.clinic_id).toBe(clinic.id);
    expect(payload.status).toBe("ACTIVE");
    expect(new Date(payload.expires_at).getTime() - new Date(payload.issued_at).getTime()).toBe(
      TOKEN_TTL_MS,
    );
    expect(TOKEN_TTL_MS).toBe(25 * 3600 * 1000);
  });

  it("verifies with the exported PUBLIC key only (what D4 embeds)", () => {
    const token = issueToken(clinic);
    expect(verifyToken(token, publicKeyB64())).not.toBeNull();
  });

  it("rejects tampered payloads and garbage", () => {
    const token = issueToken(clinic);
    const [payloadB64, sig] = token.split(".") as [string, string];
    const tampered = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    tampered.status = "ACTIVE";
    tampered.plan = "enterprise-forever"; // attacker upgrades their plan
    const forged = `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${sig}`;
    expect(verifyToken(forged)).toBeNull();
    expect(verifyToken("not-a-token")).toBeNull();
    expect(verifyToken("")).toBeNull();
    expect(verifyToken(`${payloadB64}.AAAA`)).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then blocks with retry-after", () => {
    resetRateLimiter();
    for (let i = 0; i < 5; i++) expect(rateLimit("t", "ip1", 5, 60_000).allowed).toBe(true);
    const blocked = rateLimit("t", "ip1", 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // separate key unaffected
    expect(rateLimit("t", "ip2", 5, 60_000).allowed).toBe(true);
  });
});

describe("admin auth", () => {
  it("bcrypt password verification against env hash", async () => {
    expect(await verifyAdminPassword("correct horse battery staple")).toBe(true);
    expect(await verifyAdminPassword("wrong")).toBe(false);
  });

  it("session cookies: valid until expiry, tamper-proof", () => {
    const v = createSessionCookieValue();
    expect(isValidSessionCookieValue(v)).toBe(true);
    expect(isValidSessionCookieValue(undefined)).toBe(false);
    const [exp, mac] = v.split(".") as [string, string];
    expect(isValidSessionCookieValue(`${Number(exp) + 9_999_999}.${mac}`)).toBe(false); // forged expiry
    expect(isValidSessionCookieValue(v, Date.now() + 13 * 3600 * 1000)).toBe(false); // expired
  });
});
