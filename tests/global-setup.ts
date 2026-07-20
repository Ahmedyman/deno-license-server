import { readFileSync } from "fs";
import path from "path";
import { Client } from "pg";

/**
 * Creates the scratch test database and applies the real schema (sql/*.sql),
 * drops it afterwards. Needs a Postgres to do that on — TEST_ADMIN_URL, or a
 * default local dev instance. Never touches the Neon project.
 */

const ADMIN_URL =
  process.env.TEST_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres";
export const TEST_DB = "dls_test";

export async function setup(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end();
  }
  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(path.join(process.cwd(), "sql", "001-init.sql"), "utf8"));
  } finally {
    await client.end();
  }
}

export async function teardown(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
