import { generateKeyPairSync } from "crypto";

/**
 * One-time Ed25519 keypair generation (docs/11 §1). Prints env lines to
 * stdout — writes NOTHING to disk. The private key goes into the License
 * Server's env (Ahmed's infra only); the public key is what Phase D4 embeds
 * in Clinic Server builds as a compile-time constant.
 */

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

const privB64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const pubB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

console.log("# Add to .env.local / hosting env — NEVER commit this value:");
console.log(`LICENSE_PRIVATE_KEY=${privB64}`);
console.log("");
console.log("# Public key (safe to share — embed in the Clinic Server build in Phase D4):");
console.log(`# LICENSE_PUBLIC_KEY=${pubB64}`);
