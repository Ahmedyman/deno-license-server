import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Ahmed-only admin auth (docs/10 §5: "minimal admin UI, Ahmed-only, his own
 * login"). One password, stored as a bcrypt hash in env ADMIN_PASSWORD_HASH
 * (scripts/hash-password.mts); sessions are HMAC-signed expiry cookies —
 * no session table, nothing to store, nothing to leak.
 */

const SESSION_COOKIE = "dls_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — Ahmed logs in per working session

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (>= 32 chars)");
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) throw new Error("ADMIN_PASSWORD_HASH is not set");
  return bcrypt.compare(password, hash);
}

/** value: "<expiresAtMs>.<hmac>" */
export function createSessionCookieValue(now = Date.now()): string {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function isValidSessionCookieValue(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const exp = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(exp);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(exp) > now;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

/** Set-Cookie header value for login (HttpOnly, SameSite=Lax, Secure in prod). */
export function sessionSetCookie(value: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readSessionFromCookieHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}
