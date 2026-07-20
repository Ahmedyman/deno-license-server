import { Pool } from "pg";

/**
 * One shared pool against the Neon project (DATABASE_URL from env; Neon URLs
 * carry sslmode=require and pg honors it). Tests point DATABASE_URL at a
 * scratch database instead — nothing here knows the difference.
 */
let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

/** Test hook: close and forget the pool (so a suite can repoint DATABASE_URL). */
export async function resetDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
