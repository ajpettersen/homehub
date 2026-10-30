import { randomBytes } from "node:crypto";
import { db, userCredentialsTable, type UserCredentials } from "@workspace/db";
import { eq } from "drizzle-orm";

// Who an account belongs to (email and name), now that HomeHub runs its own
// sign-in instead of asking Clerk.

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= 80 ? name : null;
}

/** New accounts get an id shaped like the old Clerk ones but clearly HomeHub's own. */
export function newAccountId(): string {
  return `hh_${randomBytes(16).toString("base64url")}`;
}

export async function getAccount(clerkId: string): Promise<UserCredentials | null> {
  const [account] = await db.select().from(userCredentialsTable)
    .where(eq(userCredentialsTable.clerkId, clerkId)).limit(1);
  return account ?? null;
}

export async function getAccountByEmail(email: string): Promise<UserCredentials | null> {
  const [account] = await db.select().from(userCredentialsTable)
    .where(eq(userCredentialsTable.email, email)).limit(1);
  return account ?? null;
}

export function accountDisplayName(account: Pick<UserCredentials, "displayName" | "email"> | null, fallback: string): string {
  return account?.displayName?.trim() || account?.email.split("@")[0] || fallback;
}
