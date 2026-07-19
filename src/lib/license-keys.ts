import { createHash, randomBytes } from "crypto";

/**
 * License keys — docs/11 §2: `DENO-XXXX-XXXX-XXXX-XXXX`, base32, generated
 * here, stored HASHED only (sha256 hex). The raw key exists exactly twice:
 * in the admin's browser at creation time, and in the clinic's activation
 * request — never in this database.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const LICENSE_KEY_REGEX = /^DENO-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/;

export function generateLicenseKey(): string {
  const bytes = randomBytes(16);
  let chars = "";
  for (let i = 0; i < 16; i++) chars += BASE32[bytes[i]! % 32];
  return `DENO-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

/** Tolerate what a human types: trim, uppercase. */
export function normalizeLicenseKey(input: string): string {
  return input.trim().toUpperCase();
}

export function licenseKeyHash(key: string): string {
  return createHash("sha256").update(normalizeLicenseKey(key), "utf8").digest("hex");
}
