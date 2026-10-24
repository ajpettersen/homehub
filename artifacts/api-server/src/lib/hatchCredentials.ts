import { db, hatchConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./hatchCrypto";
import type { HatchAccount } from "./hatchClient";

function sessionSecret(): string | null {
  return process.env.SESSION_SECRET?.trim() || null;
}

/**
 * The household's Hatch login: the one a parent entered in the app, otherwise
 * HATCH_EMAIL / HATCH_PASSWORD from the environment. Null when neither exists
 * or a stored password can't be decrypted.
 */
export async function loadHatchAccount(householdId: number): Promise<{ account: HatchAccount; source: "app" | "env" } | null> {
  const secret = sessionSecret();
  if (secret) {
    const [row] = await db.select().from(hatchConnectionsTable).where(eq(hatchConnectionsTable.householdId, householdId)).limit(1);
    if (row) {
      const password = decryptSecret(row.encryptedPassword, secret);
      if (password) return { account: { key: `household:${householdId}`, email: row.email, password }, source: "app" };
    }
  }
  const email = process.env.HATCH_EMAIL?.trim();
  const password = process.env.HATCH_PASSWORD;
  if (email && password) return { account: { key: "env", email, password }, source: "env" };
  return null;
}

export async function saveHatchConnection(householdId: number, email: string, password: string): Promise<void> {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is required to store a Hatch login");
  const encryptedPassword = encryptSecret(password, secret);
  await db.insert(hatchConnectionsTable)
    .values({ householdId, email, encryptedPassword })
    .onConflictDoUpdate({ target: hatchConnectionsTable.householdId, set: { email, encryptedPassword, updatedAt: new Date() } });
}

export async function deleteHatchConnection(householdId: number): Promise<void> {
  await db.delete(hatchConnectionsTable).where(eq(hatchConnectionsTable.householdId, householdId));
}
