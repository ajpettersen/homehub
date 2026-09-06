import { getAuth } from "@clerk/express";
import type { Request } from "express";

export const DEV_PREVIEW_CLERK_ID = "homehub_dev_preview";

export function isDevelopmentPreviewEnabled(): boolean {
  const isDeployment =
    process.env.REPLIT_DEPLOYMENT === "1" ||
    process.env.REPLIT_DEPLOYMENT === "true";
  return process.env.NODE_ENV === "development" && !isDeployment;
}

export function getEffectiveClerkId(req: Request): string | null {
  return getAuth(req).userId ?? (isDevelopmentPreviewEnabled() ? DEV_PREVIEW_CLERK_ID : null);
}