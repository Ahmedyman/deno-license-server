import { generateKeyPairSync } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Per-file test env: scratch DB URL + EPHEMERAL signing key (a fresh keypair
 * every run — CLAUDE.md rule 4: no key material ever appears in the repo).
 */

const ADMIN_URL =
  process.env.TEST_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.DATABASE_URL = ADMIN_URL.replace(/\/[^/]*$/, "/dls_test");

const { privateKey } = generateKeyPairSync("ed25519");
process.env.LICENSE_PRIVATE_KEY = privateKey
  .export({ format: "der", type: "pkcs8" })
  .toString("base64");

process.env.SESSION_SECRET = "test-session-secret-test-session-secret";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("correct horse battery staple", 4);
