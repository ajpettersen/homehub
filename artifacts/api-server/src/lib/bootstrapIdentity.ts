import { db, userProfilesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getAccount } from "./accounts";

/**
 * Whether this account is the configured household owner
 * (HOMEHUB_BOOTSTRAP_EMAIL, or HOMEHUB_BOOTSTRAP_CLERK_ID).
 *
 * HomeHub doesn't send email, so an email typed at sign-up proves nothing.
 * The email only counts when it came from Clerk already verified, or on a
 * brand-new install where no household administrator exists yet.
 */
export async function isConfiguredBootstrapIdentity(clerkId: string): Promise<boolean> {
  const configuredClerkId = process.env.HOMEHUB_BOOTSTRAP_CLERK_ID?.trim();
  if (configuredClerkId && configuredClerkId === clerkId) return true;

  const configuredEmail = process.env.HOMEHUB_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) return false;

  const account = await getAccount(clerkId);
  if (!account || account.email !== configuredEmail) return false;
  if (account.emailVerified) return true;

  const [existingAdmin] = await db.select({ id: userProfilesTable.id })
    .from(userProfilesTable)
    .where(and(eq(userProfilesTable.role, "family"), eq(userProfilesTable.isAdmin, true)))
    .limit(1);
  return !existingAdmin;
}
