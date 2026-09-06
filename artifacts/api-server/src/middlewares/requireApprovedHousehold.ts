import type { NextFunction, Request, Response } from "express";
import {
  getPropertyAuthorizationScope,
  type PropertyAuthorizationScope,
} from "../lib/propertyAuthorization";
import { getEffectiveClerkId } from "../lib/effectiveClerkId";

const SCOPE_KEY = "homeHubScope";

export async function requireApprovedHousehold(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const clerkId = getEffectiveClerkId(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const scope = await getPropertyAuthorizationScope(clerkId);
    if (!scope) {
      res.status(403).json({ error: "Household access required" });
      return;
    }
    res.locals[SCOPE_KEY] = scope;
    next();
  } catch (err) {
    req.log.error({ err }, "Failed to authorize household request");
    res.status(500).json({ error: "Internal server error" });
  }
}

export function getApprovedHouseholdScope(res: Response): PropertyAuthorizationScope {
  const scope = res.locals[SCOPE_KEY] as PropertyAuthorizationScope | undefined;
  if (!scope) throw new Error("Approved household scope middleware was not applied");
  return scope;
}

/**
 * Restricts household mutations to an approved family account that is linked
 * to a parent record in the same household. This deliberately does not use
 * the legacy administrator flag.
 */
export function requireApprovedLinkedAdult(
  res: Response,
): PropertyAuthorizationScope | null {
  const scope = getApprovedHouseholdScope(res);
  if (!isApprovedLinkedAdultScope(scope)) {
    res.status(403).json({ error: "An approved adult family account is required" });
    return null;
  }
  return scope;
}

export function isApprovedLinkedAdultScope(
  scope: PropertyAuthorizationScope,
): boolean {
  return scope.role === "family" && scope.linkedFamilyMemberId !== null;
}