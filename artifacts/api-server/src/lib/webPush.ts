import { createHash, createECDH } from "node:crypto";
import webPush from "web-push";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function deriveVapidKeys(secret: string): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  let candidate = createHash("sha256")
    .update("homehub:web-push:v1:")
    .update(secret)
    .digest();

  // setPrivateKey rejects the vanishingly unlikely out-of-range scalar.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      ecdh.setPrivateKey(candidate);
      return {
        publicKey: toBase64Url(ecdh.getPublicKey(undefined, "uncompressed")),
        privateKey: toBase64Url(candidate),
      };
    } catch {
      candidate = createHash("sha256").update(candidate).digest();
    }
  }
  throw new Error("Unable to derive Web Push signing key");
}

const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required for Web Push");
}

export const vapidKeys = deriveVapidKeys(sessionSecret);
webPush.setVapidDetails("mailto:notifications@homehub.app", vapidKeys.publicKey, vapidKeys.privateKey);

export async function ensureWebPushSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      id serial PRIMARY KEY,
      household_id integer NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      clerk_id text NOT NULL,
      endpoint text NOT NULL,
      keys jsonb NOT NULL,
      device_label text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS web_push_subscriptions_endpoint_unique
      ON web_push_subscriptions(endpoint)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS web_push_subscriptions_household_idx
      ON web_push_subscriptions(household_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS web_push_subscriptions_clerk_idx
      ON web_push_subscriptions(clerk_id)
  `);
}

export { webPush };