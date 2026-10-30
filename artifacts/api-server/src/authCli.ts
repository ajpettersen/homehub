// One-off sign-in chores, run against a database from the command line:
//
//   pnpm --filter @workspace/api-server run auth import-clerk-users [--dry-run]
//     Copies each existing account's email and name out of Clerk so people
//     can sign in with HomeHub's own login. Needs CLERK_SECRET_KEY. Safe to
//     run again: accounts HomeHub already has are left alone.
//
//   pnpm --filter @workspace/api-server run auth password-link <email> [--url https://…]
//     Prints a single-use, 7-day "set your password" link for that account.
//
// For production, prefix with `railway run --service homehub`.
import { db, pool, userCredentialsTable, userProfilesTable } from "@workspace/db";
import { isNull, eq } from "drizzle-orm";
import { getAccountByEmail, normalizeDisplayName, normalizeEmail } from "./lib/accounts";
import { createPasswordSetupToken } from "./lib/passwordSetup";

const DEFAULT_APP_URL = "https://homehub-production-5db0.up.railway.app";

interface ClerkUser {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string; verification?: { status?: string } | null }[];
}

async function importClerkUsers(dryRun: boolean) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY must be set to read accounts from Clerk.");

  const missing = await db.select({ clerkId: userProfilesTable.clerkId, role: userProfilesTable.role })
    .from(userProfilesTable)
    .leftJoin(userCredentialsTable, eq(userProfilesTable.clerkId, userCredentialsTable.clerkId))
    .where(isNull(userCredentialsTable.clerkId));

  console.log(`${missing.length} account(s) without a HomeHub login.`);
  let imported = 0;
  for (const { clerkId, role } of missing) {
    if (!clerkId.startsWith("user_")) {
      console.log(`  skip ${clerkId} (${role}): not a Clerk account`);
      continue;
    }
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!response.ok) {
      console.log(`  skip ${clerkId} (${role}): Clerk answered ${response.status}`);
      continue;
    }
    const user = await response.json() as ClerkUser;
    const primary = user.email_addresses?.find(e => e.id === user.primary_email_address_id)
      ?? user.email_addresses?.[0];
    const email = normalizeEmail(primary?.email_address);
    if (!email) {
      console.log(`  skip ${clerkId} (${role}): no email in Clerk`);
      continue;
    }
    const taken = await getAccountByEmail(email);
    if (taken) {
      console.log(`  skip ${clerkId} (${role}): ${email} already belongs to ${taken.clerkId}`);
      continue;
    }
    const displayName = normalizeDisplayName([user.first_name, user.last_name].filter(Boolean).join(" "))
      ?? normalizeDisplayName(user.username);
    const emailVerified = primary?.verification?.status === "verified";
    console.log(`  ${dryRun ? "would import" : "import"} ${email} (${role}${emailVerified ? ", verified" : ""}${displayName ? `, ${displayName}` : ""})`);
    if (!dryRun) {
      await db.insert(userCredentialsTable).values({ clerkId, email, displayName, emailVerified });
      imported++;
    }
  }
  console.log(dryRun ? "Dry run: nothing written." : `Imported ${imported} account(s).`);
}

async function printPasswordLink(rawEmail: string | undefined, appUrl: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error("Give the account's email: auth password-link <email>");
  const account = await getAccountByEmail(email);
  if (!account) throw new Error(`No HomeHub login uses ${email}. Run import-clerk-users first?`);
  const { token, expiresAt } = await createPasswordSetupToken(account.clerkId, null);
  console.log(`Set-password link for ${email} (works once, until ${expiresAt.toISOString()}):`);
  console.log(`${appUrl.replace(/\/+$/, "")}/set-password#${token}`);
}

const [command, ...rest] = process.argv.slice(2);
const urlFlag = rest.indexOf("--url");
const appUrl = urlFlag >= 0 ? rest[urlFlag + 1] : process.env.HOMEHUB_APP_URL || DEFAULT_APP_URL;
const positional = rest.filter((arg, i) => !arg.startsWith("--") && rest[i - 1] !== "--url");

try {
  if (command === "import-clerk-users") await importClerkUsers(rest.includes("--dry-run"));
  else if (command === "password-link") await printPasswordLink(positional[0], appUrl);
  else {
    console.error("Usage: auth import-clerk-users [--dry-run] | auth password-link <email> [--url https://…]");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
