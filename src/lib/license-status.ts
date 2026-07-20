import type { LicensedClinic } from "./clinics";
import type { TokenStatus } from "./tokens";

/**
 * Effective status per docs/11 §7.1 — natural expiry vs manual suspension:
 *  1. stored SUSPENDED (owner clicked Suspend) → SUSPENDED. Immediate lock on
 *     receipt, no grace. Always wins, including during an expiry grace window.
 *  2. otherwise, expires_at set AND in the past → EXPIRED_GRACE (computed at
 *     heartbeat time — never stored; licensed_clinics.status keeps exactly
 *     ACTIVE/SUSPENDED). Clinic side maps this onto the same 7-day grace
 *     mechanism as connectivity loss (§5).
 *  3. otherwise → ACTIVE. Renewal is just the owner extending expires_at.
 */
export function effectiveStatus(
  clinic: Pick<LicensedClinic, "status" | "expires_at">,
  now: Date = new Date(),
): TokenStatus {
  if (clinic.status === "SUSPENDED") return "SUSPENDED";
  if (clinic.expires_at && new Date(clinic.expires_at).getTime() < now.getTime()) {
    return "EXPIRED_GRACE";
  }
  return "ACTIVE";
}
