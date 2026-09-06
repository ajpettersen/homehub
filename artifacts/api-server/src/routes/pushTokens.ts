import { Router } from "express";
import { db } from "@workspace/db";
import { pushTokensTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import {
  getApprovedHouseholdScope,
  requireApprovedLinkedAdult,
} from "../middlewares/requireApprovedHousehold";
import { getEffectiveClerkId } from "../lib/effectiveClerkId";

const router = Router();

const MAX_TOKEN_LEN = 512;
const MAX_DEVICE_LABEL_LEN = 200;

function isValidToken(token: unknown): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN_LEN;
}

// Register or refresh a push token
router.post("/push-tokens", async (req, res) => {
  const clerkId = getEffectiveClerkId(req);
  if (!clerkId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const scope = requireApprovedLinkedAdult(res);
  if (!scope) return;

  const { token, deviceLabel } = req.body as { token?: unknown; deviceLabel?: unknown };
  if (!isValidToken(token)) {
    return res.status(400).json({ error: "token is required" });
  }
  const label =
    typeof deviceLabel === "string" ? deviceLabel.slice(0, MAX_DEVICE_LABEL_LEN) : undefined;

  // Upsert: refresh if it already exists and is owned by this Clerk user,
  // insert if new. Never claim or overwrite a token owned by someone else.
  const [existing] = await db
    .select()
    .from(pushTokensTable)
    .where(eq(pushTokensTable.token, token))
    .limit(1);

  if (existing) {
    if (existing.clerkId !== clerkId) {
      return res.status(409).json({ error: "Token is registered to another account" });
    }
    await db
      .update(pushTokensTable)
      .set({
        updatedAt: new Date(),
        householdId: scope.householdId,
        deviceLabel: label ?? existing.deviceLabel,
      })
      .where(and(
        eq(pushTokensTable.token, token),
        eq(pushTokensTable.clerkId, clerkId),
      ));
  } else {
    await db.insert(pushTokensTable).values({
      token,
      clerkId,
      householdId: scope.householdId,
      deviceLabel: label,
    });
  }

  return res.json({ ok: true });
});

// Remove a push token (e.g. on logout) — only the owner may delete it
router.delete("/push-tokens/:token", async (req, res) => {
  const clerkId = getEffectiveClerkId(req);
  if (!clerkId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const scope = getApprovedHouseholdScope(res);

  const token = req.params.token;
  if (!isValidToken(token)) {
    return res.status(400).json({ error: "token is required" });
  }

  await db
    .delete(pushTokensTable)
    .where(and(
      eq(pushTokensTable.token, token),
      eq(pushTokensTable.clerkId, clerkId),
      eq(pushTokensTable.householdId, scope.householdId),
    ));
  return res.json({ ok: true });
});

export default router;
