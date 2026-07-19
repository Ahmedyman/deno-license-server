import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { Client } from "pg";

/**
 * Applies sql/*.sql in filename order. Tiny by design — this service has one
 * table; when a real migration history is ever needed, revisit (not before).
 * Reads DATABASE_URL from env, falling back to .env.local (never committed).
 */

function loadEnvLocal(): void {
  const p = path.join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1]! in process.env)) {
      // match Next's loader semantics for the subset we use: strip optional
      // quotes, unescape `\$` (required form for $-containing values)
      process.env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2").replace(/\\\$/g, "$");
    }
  }
}

loadEnvLocal();
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (or DIRECT_URL) in the environment or .env.local first.");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  for (const f of readdirSync(path.join(process.cwd(), "sql")).sort()) {
    if (!f.endsWith(".sql")) continue;
    process.stdout.write(`applying ${f} … `);
    await client.query(readFileSync(path.join(process.cwd(), "sql", f), "utf8"));
    console.log("ok");
  }
} finally {
  await client.end();
}
console.log("migrations complete");
