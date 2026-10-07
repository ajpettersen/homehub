import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { db, householdsTable, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// The wall screen has no keyboard to sign in with, so it is "paired" once with
// a secret key (KIOSK_PAIRING_KEY, set in Railway). Pairing hands the browser a
// signed cookie that lasts a year. Changing the key un-pairs every screen.
//
// This deliberately does not use the visitor's IP address: behind Railway's
// edge the address the server sees is not reliably the visitor's.

export interface KioskScope {
  householdId: number;
  householdName: string;
  propertyIds: number[];
}

export const KIOSK_COOKIE_NAME = "homehub_kiosk";
export const KIOSK_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_KEY_LENGTH = 16;
const KIOSK_SCOPE_KEY = "homeHubKioskScope";

export function getPairingKey(): string | null {
  const key = process.env.KIOSK_PAIRING_KEY?.trim();
  return key && key.length >= MIN_KEY_LENGTH ? key : null;
}

function sign(key: string, expiresAt: number): string {
  return createHmac("sha256", key).update(`kiosk:${expiresAt}`).digest("base64url");
}

export function createKioskCookieValue(key: string, now = Date.now()): string {
  const expiresAt = now + KIOSK_COOKIE_MAX_AGE_MS;
  return `${expiresAt}.${sign(key, expiresAt)}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function isValidKioskCookie(key: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [expiry, signature, ...extra] = value.split(".");
  if (!expiry || !signature || extra.length > 0 || !/^\d{1,16}$/.test(expiry)) return false;
  const expiresAt = Number(expiry);
  if (expiresAt <= now) return false;
  return safeEqual(signature, sign(key, expiresAt));
}

export function keyMatches(provided: unknown, key: string): boolean {
  return typeof provided === "string" && provided.length <= 200 && safeEqual(provided.trim(), key);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

// Wrong-key attempts are limited across all visitors rather than per address
// (addresses aren't reliable here). Ten misses locks pairing for ten minutes,
// which makes guessing a 16+ character key hopeless.
const FAILURE_WINDOW_MS = 10 * 60_000;
const MAX_FAILURES = 10;
let failures: number[] = [];

export function pairingLocked(now = Date.now()): boolean {
  failures = failures.filter(at => now - at < FAILURE_WINDOW_MS);
  return failures.length >= MAX_FAILURES;
}

export function recordPairingFailure(now = Date.now()): void {
  failures.push(now);
}

async function resolveHousehold(): Promise<{ id: number; name: string } | null> {
  const configured = Number(process.env.KIOSK_HOUSEHOLD_ID);
  if (Number.isInteger(configured) && configured > 0) {
    const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, configured)).limit(1);
    return household ? { id: household.id, name: household.name } : null;
  }
  const households = await db.select().from(householdsTable).limit(2);
  return households.length === 1 ? { id: households[0].id, name: households[0].name } : null;
}

export async function requireKioskPairing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const key = getPairingKey();
    if (!key) {
      res.status(503).json({
        code: "not_configured",
        error: "The wall screen isn't set up yet. Add KIOSK_PAIRING_KEY (16+ characters) in Railway.",
      });
      return;
    }
    if (!isValidKioskCookie(key, readCookie(req.headers.cookie, KIOSK_COOKIE_NAME))) {
      res.status(401).json({ code: "needs_pairing", error: "This screen isn't paired yet." });
      return;
    }
    const household = await resolveHousehold();
    if (!household) {
      res.status(503).json({ code: "no_household", error: "Couldn't tell which household this screen belongs to. Set KIOSK_HOUSEHOLD_ID." });
      return;
    }
    const properties = await db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(eq(propertiesTable.householdId, household.id));
    const scope: KioskScope = {
      householdId: household.id,
      householdName: household.name,
      propertyIds: properties.map(property => property.id),
    };
    res.locals[KIOSK_SCOPE_KEY] = scope;
    next();
  } catch (err) {
    req.log.error({ err }, "Failed to authorize kiosk request");
    res.status(500).json({ error: "Internal server error" });
  }
}

export function getKioskScope(res: Response): KioskScope {
  const scope = res.locals[KIOSK_SCOPE_KEY] as KioskScope | undefined;
  if (!scope) throw new Error("Kiosk pairing middleware was not applied");
  return scope;
}
