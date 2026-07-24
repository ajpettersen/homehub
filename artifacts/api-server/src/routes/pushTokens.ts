import { Router } from "express";
import { db } from "@workspace/db";
import { pushTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Register or refresh a push token
router.post("/push-tokens", async (req, res) => {
  const { token, deviceLabel } = req.body as { token: string; deviceLabel?: string };
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token is required" });
  }

  // Upsert: update updatedAt if it already exists, insert if new
  const existing = await db
    .select()
    .from(pushTokensTable)
    .where(eq(pushTokensTable.token, token))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushTokensTable)
      .set({ updatedAt: new Date(), deviceLabel: deviceLabel ?? existing[0].deviceLabel })
      .where(eq(pushTokensTable.token, token));
  } else {
    await db.insert(pushTokensTable).values({ token, deviceLabel });
  }

  return res.json({ ok: true });
});

// Remove a push token (e.g. on logout)
router.delete("/push-tokens/:token", async (req, res) => {
  await db
    .delete(pushTokensTable)
    .where(eq(pushTokensTable.token, req.params.token));
  return res.json({ ok: true });
});

export default router;
