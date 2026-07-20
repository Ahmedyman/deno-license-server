import { z } from "zod";
import { getClinic, touchLastSeen } from "@/lib/clinics";
import { effectiveStatus } from "@/lib/license-status";
import { issueToken, verifyToken } from "@/lib/tokens";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * POST /heartbeat — docs/11 §4, implemented exactly:
 *   { token, fingerprint } → verify Ed25519 signature (defense in depth) →
 *   load the clinic row by payload.clinic_id (the DB is AUTHORITATIVE for
 *   status) → fingerprint must match the bound install → issue a FRESH token
 *   (new issued_at / expires_at = now+25h) carrying the CURRENT status —
 *   which is how an explicit SUSPENDED reaches the clinic (§7).
 *
 * Note: an expired token is still accepted here on purpose — heartbeat is how
 * a clinic recovers from an outage; grace/lock policy is enforced client-side
 * per §5/§6, and the fresh token carries the authoritative status anyway.
 */

// effective-status derivation (ACTIVE / SUSPENDED / computed EXPIRED_GRACE)
// lives in src/lib/license-status.ts — docs/11 §7.1

const Body = z.object({
  token: z.string().min(1).max(4096),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/i, "sha256 hex expected"),
});

export async function POST(req: Request): Promise<Response> {
  const rl = rateLimit("heartbeat", clientIp(req), 60, 60_000);
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

  const payload = verifyToken(body.token);
  if (!payload) return Response.json({ error: "invalid_token" }, { status: 401 });

  const clinic = await getClinic(payload.clinic_id);
  if (!clinic) return Response.json({ error: "unknown_clinic" }, { status: 404 });
  if (!clinic.fingerprint || clinic.fingerprint !== body.fingerprint.toLowerCase()) {
    return Response.json({ error: "fingerprint_mismatch" }, { status: 403 });
  }

  await touchLastSeen(clinic.id);
  return Response.json({
    token: issueToken({ id: clinic.id, plan: clinic.plan, status: effectiveStatus(clinic) }),
  });
}
