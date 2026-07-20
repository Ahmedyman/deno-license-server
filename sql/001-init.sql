-- deno-license-server — the ENTIRE schema (docs/10-DESKTOP-SRS §5, docs/11 §8).
-- Exactly the columns specified in docs/12 Phase D3 — nothing more. There is no
-- patient/clinic-operational data model in this service, by design; any column
-- added here is guilty until proven innocent (CLAUDE.md rule 1).

CREATE TABLE IF NOT EXISTS licensed_clinics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  contact      TEXT NOT NULL DEFAULT '',
  key_hash     CHAR(64) NOT NULL UNIQUE,       -- sha256 hex of the license key; raw keys are never stored
  plan         TEXT NOT NULL DEFAULT 'standard',
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  expires_at   TIMESTAMPTZ,                    -- subscription expiry (admin-set, informational for the vendor)
  fingerprint  CHAR(64),                       -- sha256 install fingerprint; one key = one install (Iron Rule 9)
  last_seen_at TIMESTAMPTZ                     -- last successful activate/heartbeat
);
