import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import {
  getPropertyAuthorizationScope,
  type PropertyAuthorizationScope,
} from "../lib/propertyAuthorization";

const SCOPE_KEY = "homeHubScope";

export async function requireApprovedHousehold(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const clerkId = getAuth(req).userId;
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