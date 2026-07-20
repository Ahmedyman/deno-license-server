import { db } from "./db";
import { generateLicenseKey, licenseKeyHash } from "./license-keys";

/**
 * Data access for the ONE table this service owns. Every function here touches
 * licensed_clinics and nothing else — there is nothing else (CLAUDE.md rule 1).
 */

export interface LicensedClinic {
  id: string;
  name: string;
  contact: string;
  key_hash: string;
  plan: string;
  status: "ACTIVE" | "SUSPENDED";
  expires_at: Date | null;
  fingerprint: string | null;
  last_seen_at: Date | null;
}

export async function listClinics(): Promise<LicensedClinic[]> {
  const res = await db().query<LicensedClinic>(
    `SELECT * FROM licensed_clinics ORDER BY name`,
  );
  return res.rows;
}

export async function getClinic(id: string): Promise<LicensedClinic | null> {
  const res = await db().query<LicensedClinic>(`SELECT * FROM licensed_clinics WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function findClinicByKeyHash(keyHash: string): Promise<LicensedClinic | null> {
  const res = await db().query<LicensedClinic>(
    `SELECT * FROM licensed_clinics WHERE key_hash = $1`,
    [keyHash],
  );
  return res.rows[0] ?? null;
}

/**
 * Create a clinic + its license key. Returns the RAW key exactly once — the
 * admin page shows it to Ahmed at sale time; only the hash is stored.
 */
export async function createClinic(input: {
  name: string;
  contact: string;
  plan: string;
  expiresAt: Date | null;
}): Promise<{ clinic: LicensedClinic; licenseKey: string }> {
  const licenseKey = generateLicenseKey();
  const res = await db().query<LicensedClinic>(
    `INSERT INTO licensed_clinics (name, contact, key_hash, plan, status, expires_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5) RETURNING *`,
    [input.name, input.contact, licenseKeyHash(licenseKey), input.plan, input.expiresAt],
  );
  return { clinic: res.rows[0]!, licenseKey };
}

export async function setClinicStatus(id: string, status: "ACTIVE" | "SUSPENDED"): Promise<void> {
  await db().query(`UPDATE licensed_clinics SET status = $2 WHERE id = $1`, [id, status]);
}

export async function updatePlanExpiry(id: string, plan: string, expiresAt: Date | null): Promise<void> {
  await db().query(`UPDATE licensed_clinics SET plan = $2, expires_at = $3 WHERE id = $1`, [
    id,
    plan,
    expiresAt,
  ]);
}

/**
 * Bind the install fingerprint on first activation. Guarded WHERE makes the
 * one-key-one-install rule atomic even under concurrent activation attempts:
 * the row updates only if the slot is empty or already this fingerprint.
 */
export async function bindFingerprint(id: string, fingerprint: string): Promise<boolean> {
  const res = await db().query(
    `UPDATE licensed_clinics SET fingerprint = $2, last_seen_at = now()
     WHERE id = $1 AND (fingerprint IS NULL OR fingerprint = $2)`,
    [id, fingerprint],
  );
  return (res.rowCount ?? 0) === 1;
}

export async function touchLastSeen(id: string): Promise<void> {
  await db().query(`UPDATE licensed_clinics SET last_seen_at = now() WHERE id = $1`, [id]);
}
