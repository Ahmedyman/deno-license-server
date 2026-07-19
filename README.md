# deno-license-server

Subscription/licensing service for **Deno Clinic** on-premise installs. This is Ahmed's own
small hosted service (Next.js + Neon Postgres) — a **separate trust boundary** from the
`deno-clinic` application: clinics run Deno on their own PCs and own 100% of their data; this
service only tracks who is subscribed.

**Source of truth:** [`docs/11-LICENSE-PROTOCOL.md`](docs/11-LICENSE-PROTOCOL.md) (FINAL — copied
verbatim from the deno-clinic spec pack; implement exactly this, deviations go through the phase
report, never a silent redesign).

## What this service stores — and what it never stores

Stores (the ENTIRE data surface): hashed license keys (never raw), one install fingerprint per
key, owner-provided clinic display name + contact, plan / status / expiry, last-seen heartbeat
timestamp.

**Never stores, never receives:** patient data, visits, medical records, financial figures,
appointments, users — any clinic-operational data at all. If a change would add any of that to
this repo, the change is wrong (see protocol §8).

## Endpoints

- `POST /api/activate` — `{ license_key, fingerprint, clinic_name }` → `{ token }` once per
  install; one key = one fingerprint, forever (Iron Rule 9).
- `POST /api/heartbeat` — `{ token, fingerprint }` → fresh `{ token }` (always `now + 25h`),
  carrying the clinic's current status (`ACTIVE` / `SUSPENDED`).
- `/admin` — Ahmed-only UI: create clinic + license key, set plan/expiry, suspend/reactivate,
  see last-seen heartbeats.

## Setup

```
npm install
node --experimental-strip-types scripts/generate-keys.mts   # prints LICENSE_PRIVATE_KEY (+ public key for the clinic app)
node --experimental-strip-types scripts/hash-password.mts    # prints ADMIN_PASSWORD_HASH from a password you type
# put DATABASE_URL / DIRECT_URL (Neon) and the values above into .env.local  (never committed)
npm run db:migrate                                           # applies sql/*.sql
npm run dev
```

`npm test` needs a Postgres it may create scratch databases on — set `TEST_ADMIN_URL`
(defaults to `postgresql://postgres:postgres@localhost:5432/postgres`).
