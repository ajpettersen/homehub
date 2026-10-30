import type { Request } from "express";

export const DEV_PREVIEW_CLERK_ID = "homehub_dev_preview";

export function isDevelopmentPreviewEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * The signed-in account's id (user_profiles.clerk_id; the name is historical,
 * from when Clerk ran sign-in). Set by loadSignedInUser in lib/userSessions.
 */
export function getEffectiveClerkId(req: Request): string | null {
  return req.homehubUserId ?? (isDevelopmentPreviewEnabled() ? DEV_PREVIEW_CLERK_ID : null);
}
