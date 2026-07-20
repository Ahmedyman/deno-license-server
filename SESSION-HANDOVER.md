# SESSION-HANDOVER.md — deno-license-server

> Read `CLAUDE.md` (iron rules) and `docs/11-LICENSE-PROTOCOL.md` (source of truth, including
> §7.1) before doing anything here. This file is only the state note.

## State (2026-07-19)

- **Phase D3 built and evidence-complete** on `feat/d3-license-server` → **PR #1 against
  `main`, awaiting the owner's merge** (never merge it yourself). `main` = docs-only bootstrap.
- Two review rounds passed:
  1. Core D3 (activate/heartbeat/admin UI/rate limiting/hash-only storage; schema-review +
     raw-key-never-stored acceptance tests).
  2. **Natural expiry vs manual suspension** (owner decision, now protocol §7.1): heartbeats
     carry computed `EXPIRED_GRACE` when `expires_at < now`; NOT a stored status; manual
     SUSPENDED always overrides (no grace); renewal = extending `expires_at`. Tests (a)–(d)
     in `tests/protocol.test.ts`; suite 23/23.
- Full detail + evidence: `PHASE-D3-REPORT.md`.

## Environment

- Owner still needs to fill `.env.local` with the real Neon `DATABASE_URL`/`DIRECT_URL` and
  production-grade `LICENSE_PRIVATE_KEY` / `ADMIN_PASSWORD_HASH` / `SESSION_SECRET`
  (see `.env.example`; **note the `\$` escaping rule for the bcrypt hash — quotes do NOT work**).
- The current local `.env.local` holds throwaway dev values against local Postgres `dls_dev`.
- Deploy target: deliberately undecided — nothing deploy-specific exists. Do not add any.

## Next

- Owner merges PR #1, then carries the §7.1 protocol addition into deno-clinic's
  `docs/11-LICENSE-PROTOCOL.md` **himself** (explicitly not this repo's job — never touch
  deno-clinic from here).
- Phase D4 (licensing integration) happens in the deno-clinic repo, on the owner's go-ahead,
  after both docs are aligned. D4 must map `EXPIRED_GRACE` → §5 grace flow, `SUSPENDED` →
  immediate soft lock; token format documented in `src/lib/tokens.ts`.
