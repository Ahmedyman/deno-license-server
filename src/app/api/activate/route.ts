import { z } from "zod";
import { LICENSE_KEY_REGEX, licenseKeyHash, normalizeLicenseKey } from "@/lib/license-keys";
import { bindFingerprint, findClinicByKeyHash } from "@/lib/clinics";
import { issueToken } from "@/lib/tokens";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * POST /activate — docs/11 §3, implemented exactly:
 *   { license_key, fingerprint, clinic_name } →
 *     look up key_hash → require status ACTIVE → fingerprint slot empty or
 *     matching (one key = one install, Iron Rule 9) → bind + issue signed
 *     token (expires now+25h) → 200 { token }
 *
 * clinic_name is accepted per the protocol's request shape but does NOT
 * overwrite the stored name — that is owner-provided at sale time (§8);
 * the request field is display-only context and is deliberately unused.
 * Error statuses (the protocol doesn't fix them): 400 malformed, 404 unknown
 * key, 403 not-ACTIVE, 409 fingerprint already bound elsewhere, 429 rate.
 */

const Body = z.object({
  license_key: z.string().min(1).max(64),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/i, "sha256 hex expected"),
  clinic_name: z.string().max(200).optional().default(""),
});

export async function POST(req: Request): Promise<Response> {
  const rl = rateLimit("activate", clientIp(req), 10, 60_000);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const key = normalizeLicenseKey(body.license_key);
  if (!LICENSE_KEY_REGEX.test(key)) return Response.json({ error: "invalid_key" }, { status: 404 });

  const clinic = await findClinicByKeyHash(licenseKeyHash(key));
  if (!clinic) return Response.json({ error: "invalid_key" }, { status: 404 });
  if (clinic.status !== "ACTIVE") return Response.json({ error: "suspended" }, { status: 403 });

  const fingerprint = body.fingerprint.toLowerCase();
  const bound = await bindFingerprint(clinic.id, fingerprint);
  if (!bound) return Response.json({ error: "fingerprint_mismatch" }, { status: 409 });

  return Response.json({ token: issueToken(clinic) });
}
