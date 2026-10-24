import { getAuthUserById } from "./auth";

/**
 * The household owner named by HOMEHUB_BOOTSTRAP_EMAIL (or the legacy
 * HOMEHUB_BOOTSTRAP_CLERK_ID) is promoted on first sign-in. See routes/me.ts.
 */
export async function isConfiguredBootstrapIdentity(userId: string): Promise<boolean> {
  const configuredId = process.env.HOMEHUB_BOOTSTRAP_CLERK_ID?.trim();
  if (configuredId?.startsWith("user_") && configuredId === userId) {
    return true;
  }

  const configuredEmail = process.env.HOMEHUB_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) return false;

  try {
    const user = await getAuthUserById(userId);
    return user?.email.trim().toLowerCase() === configuredEmail;
  } catch {
    return false;
  }
}
