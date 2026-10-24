// HomeHub's own email + password sign-in, replacing Clerk.
//
// Every table in the app still keys users by a `clerk_id` text column. Those
// values are now just opaque HomeHub user IDs: accounts that existed under
// Clerk keep their old ID (claimed once with HOMEHUB_SETUP_CODE), and new
// accounts get a fresh `user_…` ID. Nothing else in the data model changed.
//
// Sessions are random tokens in an HttpOnly, SameSite=Lax cookie; only a
// SHA-256 of the token is stored, so a database leak can't be replayed.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readCookie } from "./kioskAccess";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export const SESSION_COOKIE_NAME = "homehub_session";
export const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

// ---------------------------------------------------------------------------
// Schema (created at startup, like ensureWebPushSchema — migrations aren't run
// automatically on Railway). Mirrored in lib/db/migrations/0042_local_auth.sql.

export async function ensureAuthSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_users (
      id text PRIMARY KEY,
      email text NOT NULL,
      password_hash text NOT NULL,
      first_name text,
      last_name text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_unique ON auth_users (lower(email))
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      expires_at timestamp with time zone NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)
  `);
  await db.execute(sql`DELETE FROM auth_sessions WHERE expires_at <= now()`);
}

// ---------------------------------------------------------------------------
// Passwords

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// A fixed hash so sign-in for an unknown email takes the same time as a wrong password.
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return "That password is too long.";
  return null;
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const value = email.trim().toLowerCase();
  if (value.length < 3 || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

export function newUserId(): string {
  return `user_${randomBytes(16).toString("hex")}`;
}

export function safeEqualStrings(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// Users

function rowToUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    email: String(row.email),
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
  };
}

export async function getAuthUserById(id: string): Promise<AuthUser | null> {
  const result = await db.execute(sql`
    SELECT id, email, first_name, last_name FROM auth_users WHERE id = ${id} LIMIT 1
  `);
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

export async function getAuthUserByEmail(email: string): Promise<(AuthUser & { passwordHash: string }) | null> {
  const result = await db.execute(sql`
    SELECT id, email, first_name, last_name, password_hash FROM auth_users
    WHERE lower(email) = ${email.toLowerCase()} LIMIT 1
  `);
  const row = result.rows[0];
  return row ? { ...rowToUser(row), passwordHash: String(row.password_hash) } : null;
}

export function displayNameFor(user: Pick<AuthUser, "firstName" | "lastName" | "email">): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    || user.email.split("@")[0]
    || "HomeHub member";
}

/**
 * Drop-in for the small part of Clerk's `clerkClient.users` API that the
 * routes use. Emails count as "verified": accounts can only be created with
 * the household setup code or a household invite, never by open sign-up.
 */
function toClerkShape(user: AuthUser) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: null as string | null,
    emailAddresses: [{ emailAddress: user.email, verification: { status: "verified" as const } }],
  };
}
export type LocalUser = ReturnType<typeof toClerkShape>;

export const localUsers = {
  async getUser(id: string): Promise<LocalUser> {
    const user = await getAuthUserById(id);
    if (!user) throw new Error("User not found");
    return toClerkShape(user);
  },
  async getUserList({ emailAddress }: { emailAddress: string[]; limit?: number }): Promise<{ data: LocalUser[] }> {
    const data: LocalUser[] = [];
    for (const email of emailAddress) {
      const user = await getAuthUserByEmail(email);
      if (user) data.push(toClerkShape(user));
    }
    return { data };
  },
};

// ---------------------------------------------------------------------------
// Sessions

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
  await db.execute(sql`
    INSERT INTO auth_sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, ${expiresAt})
  `);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  if (token) await db.execute(sql`DELETE FROM auth_sessions WHERE token_hash = ${hashToken(token)}`);
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

export async function destroyOtherSessions(req: Request, userId: string): Promise<void> {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME) ?? "";
  await db.execute(sql`
    DELETE FROM auth_sessions WHERE user_id = ${userId} AND token_hash <> ${hashToken(token)}
  `);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      homeHubUserId?: string | null;
    }
  }
}

/** Resolves the session cookie (if any) to `req.homeHubUserId`. Never rejects. */
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.homeHubUserId = null;
  const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  if (!token || token.length > 100) return next();
  try {
    const result = await db.execute(sql`
      SELECT user_id FROM auth_sessions
      WHERE token_hash = ${hashToken(token)} AND expires_at > now()
      LIMIT 1
    `);
    req.homeHubUserId = (result.rows[0]?.user_id as string | undefined) ?? null;
  } catch (err) {
    req.log?.error({ err }, "Failed to read session");
  }
  next();
}

// ---------------------------------------------------------------------------
// Rate limiting for sign-in / sign-up / setup-code attempts. In memory is fine
// for a single Railway instance. Keyed per email and globally, not per IP
// (see CLAUDE.md: visitor IPs aren't reliable behind Railway's edge).

const WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, number[]>();

export function tooManyAttempts(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(t => now - t < WINDOW_MS);
  attempts.set(key, recent);
  return recent.length >= max;
}

export function recordFailedAttempt(key: string): void {
  const list = attempts.get(key) ?? [];
  list.push(Date.now());
  attempts.set(key, list);
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
