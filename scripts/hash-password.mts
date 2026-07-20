import { createInterface } from "readline";
import bcrypt from "bcryptjs";

/** Prints ADMIN_PASSWORD_HASH for .env.local from a password typed locally. */

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question("Admin password (min 12 chars): ", (pw) => {
  rl.close();
  if (pw.length < 12) {
    console.error("Too short — use at least 12 characters.");
    process.exit(1);
  }
  const hash = bcrypt.hashSync(pw, 12);
  // bcrypt hashes contain `$`, which Next's .env loader treats as variable
  // expansion (quotes do NOT protect it — verified) — every `$` must be
  // backslash-escaped in .env files. Hosting env UIs take the raw value.
  console.log("# For .env.local (escaped — Next's dotenv expands unescaped $):");
  console.log(`ADMIN_PASSWORD_HASH=${hash.split("$").join("\\$")}`);
  console.log("# For a hosting platform's env-var UI (raw):");
  console.log(`# ${hash}`);
});
