import { Router } from "express";
import {
  db,
  HOMEHUB_WEB_TABS,
  householdsTable,
  userProfilesTable,
  type HomeHubWebTab,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();
const VALID_WEB_TABS = new Set<string>(HOMEHUB_WEB_TABS);
const REQUIRED_WEB_TABS = ["home", "settings"] satisfies HomeHubWebTab[];

/** PATCH /api/household — rename the household and/or mark onboarding complete (admin only) */
router.patch("/household", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);

    if (scope.role !== "family" || !scope.isAdmin) {
      res.status(403).json({ error: "Household administrator access required" });
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

    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx.update(householdsTable).set(updates)
        .where(eq(householdsTable.id, scope.householdId)).returning();
      if (onboardingCompleted === true && scope.linkedFamilyMemberId) {
        await tx.update(userProfilesTable).set({ personalSetupCompletedAt: new Date() }).where(and(
          eq(userProfilesTable.clerkId, scope.clerkId),
          eq(userProfilesTable.householdId, scope.householdId),
          eq(userProfilesTable.linkedFamilyMemberId, scope.linkedFamilyMemberId),
        ));
      }
      return rows;
    });

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

/** PUT /api/household/tab-visibility — update household-wide web tab visibility (admin only) */
router.put("/household/tab-visibility", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);

    if (scope.role !== "family" || !scope.isAdmin) {
      res.status(403).json({ error: "Household administrator access required" });
      return;
    }

    const { visibleTabs } = req.body as { visibleTabs?: unknown };
    if (
      !Array.isArray(visibleTabs)
      || visibleTabs.some(tab => typeof tab !== "string" || !VALID_WEB_TABS.has(tab))
      || new Set(visibleTabs).size !== visibleTabs.length
    ) {
      res.status(400).json({ error: "visibleTabs must contain unique supported tab names" });
      return;
    }

    if (REQUIRED_WEB_TABS.some(tab => !visibleTabs.includes(tab))) {
      res.status(400).json({ error: "Home and Settings must remain visible" });
      return;
    }

    // Store tabs in the canonical navigation order, independent of request order.
    const normalizedTabs = HOMEHUB_WEB_TABS.filter(tab => visibleTabs.includes(tab));
    const [updated] = await db
      .update(householdsTable)
      .set({ visibleTabs: normalizedTabs })
      .where(eq(householdsTable.id, scope.householdId))
      .returning({ visibleTabs: householdsTable.visibleTabs });

    if (!updated) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    res.json({ visibleTabs: updated.visibleTabs });
  } catch (err) {
    req.log.error({ err }, "Failed to update household tab visibility");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
