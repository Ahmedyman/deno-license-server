import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "crypto";

/**
 * Signed license tokens — docs/11 §3/§4.
 *
 * Concrete realization of "token = base64( payload + Ed25519 signature )":
 *   token   = base64url(payloadJson) + "." + base64url(signature)
 *   payload = { clinic_id, plan, issued_at, expires_at, status }
 *   signature = Ed25519 over the utf8 bytes of payloadJson
 * The Clinic Server (Phase D4) verifies with the embedded public key, fully
 * offline. `expires_at` is ALWAYS issue-time + 25h (§4) — the 1h slack over
 * the 24h heartbeat is what makes short blips harmless.
 *
 * The private key comes ONLY from env LICENSE_PRIVATE_KEY (base64 PKCS8 DER —
 * output of scripts/generate-keys.mts). Never a file, never the repo.
 */

export const TOKEN_TTL_MS = 25 * 60 * 60 * 1000; // 25h, per docs/11 §4 — do not tune

/**
 * ACTIVE / SUSPENDED mirror the stored clinic status. EXPIRED_GRACE is a
 * COMPUTED signal (docs/11 §7.1): derived at heartbeat time from
 * expires_at < now — never stored in licensed_clinics.status.
 */
export type TokenStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED_GRACE";

export interface TokenPayload {
  clinic_id: string;
  plan: string;
  issued_at: string; // ISO-8601 UTC
  expires_at: string; // ISO-8601 UTC, always issued_at + 25h
  status: TokenStatus;
}

function privateKey(): KeyObject {
  const b64 = process.env.LICENSE_PRIVATE_KEY;
  if (!b64) throw new Error("LICENSE_PRIVATE_KEY is not set");
  return createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
}

function derivedPublicKey(): KeyObject {
  // derive the public key from the private key (via PEM — the KeyObject/DER
  // overloads exist at runtime but @types/node 26 doesn't type them)
  const pem = privateKey().export({ format: "pem", type: "pkcs8" }) as string;
  return createPublicKey(pem);
}

/** SPKI-DER base64 of the verifying key — what D4 embeds in the Clinic Server build. */
export function publicKeyB64(): string {
  return derivedPublicKey().export({ format: "der", type: "spki" }).toString("base64");
}

export function issueToken(
  clinic: { id: string; plan: string; status: TokenStatus },
  now: Date = new Date(),
): string {
  const payload: TokenPayload = {
    clinic_id: clinic.id,
    plan: clinic.plan,
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
    status: clinic.status,
  };
  const payloadJson = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = sign(null, payloadJson, privateKey());
  return `${payloadJson.toString("base64url")}.${signature.toString("base64url")}`;
}

/**
 * Verify signature + shape; returns the payload or null. Signature check is
 * defense in depth — the DB row (looked up by clinic_id) stays authoritative
 * for status on every heartbeat (docs/11 §4).
 */
export function verifyToken(token: string, publicKeyDerB64?: string): TokenPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  try {
    const payloadJson = Buffer.from(token.slice(0, dot), "base64url");
    const signature = Buffer.from(token.slice(dot + 1), "base64url");
    const key = publicKeyDerB64
      ? createPublicKey({ key: Buffer.from(publicKeyDerB64, "base64"), format: "der", type: "spki" })
      : derivedPublicKey();
    if (!verify(null, payloadJson, key, signature)) return null;
    const payload = JSON.parse(payloadJson.toString("utf8")) as TokenPayload;
    if (
      typeof payload.clinic_id !== "string" ||
      typeof payload.issued_at !== "string" ||
      typeof payload.expires_at !== "string" ||
      !["ACTIVE", "SUSPENDED", "EXPIRED_GRACE"].includes(payload.status)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
