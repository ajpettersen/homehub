import net from "node:net";
import type { NextFunction, Request, Response } from "express";
import { db, householdsTable, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// The wall screen has no keyboard, so it can't sign in. Instead the server
// recognises it by the public internet address of the home network it sits on
// (KIOSK_ALLOWED_IPS, comma-separated). Anyone on that network can open /kiosk.

export interface KioskScope {
  householdId: number;
  householdName: string;
  propertyIds: number[];
}

const KIOSK_SCOPE_KEY = "homeHubKioskScope";

/** IPv6 devices on one home network share their first 64 bits, so compare just those. */
export function normalizeAddress(raw: string): string | null {
  let address = raw.trim().toLowerCase();
  if (address.startsWith("::ffff:") && net.isIPv4(address.slice(7))) address = address.slice(7);
  if (net.isIPv4(address)) return address;
  if (!net.isIPv6(address)) return null;
  const [head, tail = ""] = address.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = address.includes("::") ? 8 - headParts.length - tailParts.length : 0;
  const full = [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];
  if (full.length !== 8) return null;
  return `${full.slice(0, 4).map(part => part.padStart(4, "0")).join(":")}::/64`;
}

export function parseAllowedAddresses(value: string | undefined): Set<string> {
  const allowed = new Set<string>();
  for (const entry of (value ?? "").split(",")) {
    const normalized = normalizeAddress(entry.replace(/\/\d+$/, ""));
    if (normalized) allowed.add(normalized);
  }
  return allowed;
}

/**
 * The address Railway's proxy saw. Only the last X-Forwarded-For entry is
 * trusted: the proxy appends it, while anything earlier could be written by
 * the client.
 */
export function getRequestAddress(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
  const last = header?.split(",").map(part => part.trim()).filter(Boolean).pop();
  return normalizeAddress(last ?? req.socket.remoteAddress ?? "");
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

export async function requireKioskNetwork(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const address = getRequestAddress(req);
    const allowed = parseAllowedAddresses(process.env.KIOSK_ALLOWED_IPS);
    if (!address || !allowed.has(address)) {
      res.status(403).json({
        error: "This screen isn't on an approved home network yet.",
        yourAddress: address ? address.replace(/\/64$/, "") : null,
      });
      return;
    }
    const household = await resolveHousehold();
    if (!household) {
      res.status(503).json({ error: "Couldn't tell which household this screen belongs to. Set KIOSK_HOUSEHOLD_ID." });
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
  if (!scope) throw new Error("Kiosk network middleware was not applied");
  return scope;
}
