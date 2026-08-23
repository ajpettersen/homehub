import { Router } from "express";
import { db, householdsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();

/** PATCH /api/household — rename the household and/or mark onboarding complete (family only) */
router.patch("/household", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);

    if (scope.role !== "family") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { name, onboardingCompleted } = req.body as {
      name?: string;
      onboardingCompleted?: boolean;
    };

    const updates: Partial<typeof householdsTable.$inferInsert> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "Household name cannot be empty" });
        return;
      }
      updates.name = name.trim();
    }
    if (onboardingCompleted === true) {
      updates.onboardingCompletedAt = new Date();
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(householdsTable)
      .set(updates)
      .where(eq(householdsTable.id, scope.householdId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    res.json({
      id: String(updated.id),
      name: updated.name,
      onboardingCompleted: updated.onboardingCompletedAt !== null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update household");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
