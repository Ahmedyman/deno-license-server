# CLAUDE.md — deno-license-server

Small, boring service. That is a design goal, not an accident.

## Iron rules (inherit the deno-clinic spirit, adapted to this trust boundary)

1. **Zero patient/clinic-operational data — ever.** No column, no log line, no request field
   beyond protocol §8's surface (key hash, fingerprint, display name, contact, plan/status/
   expiry, last-seen). Schema additions are guilty until proven innocent.
2. **`docs/11-LICENSE-PROTOCOL.md` is FINAL.** Implement exactly it. A deviation is a written
   question in the phase report, never a silent alternative.
3. **Raw license keys are never stored** — hash on receipt (sha256), compare hashes only. The
   raw key is shown exactly once: to Ahmed, at creation time, in the admin UI.
4. **The Ed25519 private key lives ONLY in env** (`LICENSE_PRIVATE_KEY`) — never in the repo,
   never in a fixture, never in a test snapshot. Tests generate ephemeral keypairs.
5. **Soft-lock philosophy:** this service can mark a clinic SUSPENDED; it can never destroy or
   withhold clinic data (it has none). Nothing here may ever gain a "remote wipe"-shaped feature.
6. **Process law (same as deno-clinic):** one phase per instruction → checks (tsc, eslint,
   vitest) → `PHASE-<n>-REPORT.md` → PR → STOP. Never merge your own PR, never deploy.

## Stack

Next.js (App Router, route handlers + server-rendered admin pages, no client JS beyond forms),
`pg` against Neon Postgres, plain SQL migrations in `sql/`, vitest. Keep dependencies minimal —
every new package needs a reason this small service can't do without it.
