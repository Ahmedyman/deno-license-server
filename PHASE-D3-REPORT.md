# PHASE-D3-REPORT — License Server

**Repo:** `deno-license-server` (separate trust boundary — never part of deno-clinic) ·
**Branch:** `feat/d3-license-server` · **Spec:** `docs/11-LICENSE-PROTOCOL.md` (verbatim copy,
sha256-identical to the deno-clinic original) + deno-clinic `docs/12-DESKTOP-PHASES.md` §D3.

## What was built

- **Schema** (`sql/001-init.sql`) — ONE table, `licensed_clinics`, with **exactly** the nine
  specified columns (`id, name, contact, key_hash, plan, status, expires_at, fingerprint,
  last_seen_at`). No created_at, no audit table, no request log — nothing beyond spec.
- **Ed25519 keys** (`scripts/generate-keys.mts`) — prints `LICENSE_PRIVATE_KEY` (base64 PKCS8)
  for env and the public key (base64 SPKI) for D4 to embed in Clinic Server builds; writes
  nothing to disk; nothing key-shaped exists in the repo (tests generate ephemeral pairs).
- **`POST /api/activate`** — exact §3 flow: key-hash lookup → status must be ACTIVE →
  fingerprint slot empty-or-matching (bind is a single guarded UPDATE, so one-key-one-install is
  atomic even under concurrent activation) → signed token. **`POST /api/heartbeat`** — exact §4
  flow: signature verify (defense in depth), DB authoritative for status by clinic_id,
  fingerprint must match, fresh token every time. Every issued token's `expires_at` is
  **exactly issued_at + 25h** (constant, tested).
- **Token format** (concrete realization of §3's "base64(payload + signature)"):
  `base64url(payloadJson) + "." + base64url(ed25519_sig(payloadJson))` — documented in
  `src/lib/tokens.ts` for D4 to implement against.
- **Admin UI** (`/admin`, Ahmed-only) — bcrypt password from env + HMAC-signed session cookie
  (12h); clinic list with status/plan/expiry/install-bound/last-heartbeat, create clinic
  (license key rendered ONCE, inline — never in a URL or log), suspend/reactivate, plan+expiry
  edit. Server-rendered, zero client JS.
- **Rate limiting** — in-memory fixed windows: activate 10/min/IP, heartbeat 60/min/IP, admin
  login 5/min/IP (429 + retry-after; login redirects with an error). Per-instance by design —
  adequate for a single small deployment; revisit only if this ever scales out.
- **Key-hash-only storage** — sha256 of the normalized key; raw keys exist only in the admin's
  browser at creation and the clinic's activation request.

## Acceptance (docs/12 §D3) — evidence

- [x] **Fresh key → token issued, fingerprint bound; SAME key + DIFFERENT fingerprint →
      rejected** — proven twice: vitest through the real route handlers, and live over HTTP
      against the dev server: activation returned 200 with payload
      `{clinic_id, plan:"standard", status:"ACTIVE", ttl exactly 25h}`; the second machine got
      `409 {"error":"fingerprint_mismatch"}`; same-machine re-activation stays allowed.
- [x] **Suspend in the admin UI → next heartbeat carries SUSPENDED** — done in the actual
      browser UI: clicked Suspend on the clinic row → live heartbeat returned a signed token
      with `status: "SUSPENDED"`; clicked Reactivate → next heartbeat `status: "ACTIVE"` (no
      re-activation needed). Also covered end-to-end in vitest via the admin route handler with
      a real session cookie (and rejected without one).
- [x] **No patient/clinic-operational data model exists** — schema-review TEST (not just a
      statement): information_schema shows exactly one table with exactly the nine specified
      columns, and every column name is asserted against a forbidden-term list
      (patient/visit/tooth/diagnos/treat/payment/…). A second test proves the raw license key
      appears in ZERO stored bytes and `key_hash` equals sha256(key).

## How to verify manually

1. `npm install`, `npm run keys:generate`, `npm run admin:hash-password`, fill `.env.local`
   (see `.env.example` — note the `\$` escaping rule), `npm run db:migrate`, `npm run dev`.
2. `/admin` → create a clinic → copy the one-time key.
3. `curl -X POST localhost:4100/api/activate -H "content-type: application/json" -d
   '{"license_key":"<key>","fingerprint":"<64-hex>","clinic_name":"x"}'` → token; repeat with a
   different fingerprint → 409.
4. Suspend in `/admin` → `POST /api/heartbeat` with the token → decode the returned token's
   first base64url segment → `"status":"SUSPENDED"`.

## Findings / deviations

1. **`$` in bcrypt hashes is silently destroyed by Next's env loader** — quotes do NOT protect
   it (verified empirically: raw/single/double-quoted all load as `""`; only `\$` survives).
   Caught during live admin-login verification; `admin:hash-password` now prints the escaped
   form for `.env.local` plus the raw form for hosting env UIs, and `.env.example` documents it.
2. **Empty repo needed a base commit** — `main` holds one docs-only bootstrap commit (protocol
   copy + README + CLAUDE.md); all implementation is on this branch/PR.
3. **`activate.clinic_name` is accepted but not stored** — §8 says the stored name is
   owner-provided at sale time; the request field (per §3's shape) is treated as display-only
   context. Flagging for explicit sign-off.
4. **`next build` worker crashed once on Windows** (0xC0000409 in the lint/typecheck worker),
   clean on immediate retry and stable since; standalone `tsc`/`eslint` are the gates that
   matter and pass. Cosmetic, but noted.

## Questions for the owner

1. **Subscription `expires_at` passing** — the protocol defines SUSPENDED as an explicit admin
   action and doesn't say heartbeats should auto-degrade when the DB `expires_at` date passes.
   Currently expiry is informational (Ahmed suspends manually on non-payment). If you want
   auto-suspend-on-expiry, that's a small change to the heartbeat handler — but it changes §7
   semantics (an auto-suspension would apply without grace), so it needs your explicit call.
2. Deploy target (Vercel? other) — affects nothing in this phase but determines where env
   secrets get pasted for production.

## Checks

`next build` ✓ (11 routes) · `tsc --noEmit` ✓ · `eslint .` ✓ (0 warnings) · vitest **18/18**
(unit: keys/tokens/rate-limit/session · protocol: activation, one-key-one-install, heartbeat
freshness, admin-driven suspend/reactivate, tampered-token 401, wrong-fingerprint 403,
unauthenticated-admin rejection, 429 rate limit, schema review, raw-key-never-stored) ·
`npm audit` 0 vulnerabilities · live browser + curl walkthrough of the full flow (login incl.
wrong-password rejection, clinic creation with one-time key display, activate, 409, suspend →
SUSPENDED heartbeat, reactivate → ACTIVE heartbeat, DB shows hash only).
