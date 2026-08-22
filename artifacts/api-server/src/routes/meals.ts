import { Router } from "express";
import { db } from "@workspace/db";
import { mealPlansTable, mealRatingsTable, familyMembersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();

function entryToJson(e: any) {
  return {
    id: String(e.id),
    weekStart: e.weekStart,
    dayOfWeek: e.dayOfWeek,
    mealType: e.mealType,
    meal: e.meal,
    notes: e.notes ?? null,
    rating: e.rating ?? null,
    propertyId: String(e.propertyId),
  };
}

function ratingToJson(r: any) {
  return {
    id: String(r.id),
    mealPlanId: String(r.mealPlanId),
    memberId: String(r.memberId),
    rating: r.rating,
    createdAt: r.createdAt,
  };
}

router.get("/meal-plans", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    if (scope.propertyIds.length === 0) {
      res.json([]);
      return;
    }

    const { weekStart } = req.query;
    const conditions = [inArray(mealPlansTable.propertyId, scope.propertyIds)];
    if (weekStart) {
      conditions.push(eq(mealPlansTable.weekStart, String(weekStart)));
    }
    const entries = await db
      .select()
      .from(mealPlansTable)
      .where(and(...conditions))
      .orderBy(mealPlansTable.dayOfWeek, mealPlansTable.mealType);
    res.json(entries.map(entryToJson));
  } catch (err) {
    req.log.error({ err }, "Failed to get meal plans");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/meal-plans", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const { weekStart, dayOfWeek, mealType, meal, notes, rating, propertyId } = req.body;
    if (!weekStart || dayOfWeek === undefined || !mealType || !meal || !propertyId) {
      res.status(400).json({ error: "weekStart, dayOfWeek, mealType, meal, propertyId required" });
      return;
    }
    const propertyIdNum = Number(propertyId);
    if (isNaN(propertyIdNum)) {
      res.status(400).json({ error: "Invalid propertyId" });
      return;
    }
    if (!scope.propertyIds.includes(propertyIdNum)) {
      res.status(403).json({ error: "Property not authorized" });
      return;
    }
    const [entry] = await db
      .insert(mealPlansTable)
      .values({ weekStart, dayOfWeek: Number(dayOfWeek), mealType, meal, notes: notes ?? null, rating: rating ?? null, propertyId: propertyIdNum })
      .returning();
    res.status(201).json(entryToJson(entry));
  } catch (err) {
    req.log.error({ err }, "Failed to create meal plan entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/meal-plans/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rating, notes } = req.body ?? {};
    const VALID_PLAN_RATINGS = ["love", "ok", "skip", null];

    const updates: Record<string, unknown> = {};
    if (rating !== undefined) {
      if (!VALID_PLAN_RATINGS.includes(rating)) {
        res.status(400).json({ error: "rating must be love | ok | skip | null" });
        return;
      }
      updates.rating = rating;
    }
    if (notes !== undefined) updates.notes = notes ?? null;

    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [entry] = await db
      .update(mealPlansTable)
      .set(updates)
      .where(and(eq(mealPlansTable.id, id), inArray(mealPlansTable.propertyId, scope.propertyIds)))
      .returning();
    if (!entry) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(entryToJson(entry));
  } catch (err) {
    req.log.error({ err }, "Failed to update meal plan entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/meal-plans/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [deleted] = await db
      .delete(mealPlansTable)
      .where(and(eq(mealPlansTable.id, id), inArray(mealPlansTable.propertyId, scope.propertyIds)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete meal plan entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Per-member meal ratings ───────────────────────────────────────────────────

const VALID_RATINGS = ["love", "ok", "skip"];

async function resolveAuthorizedMealPlan(
  mealPlanId: number,
  propertyIds: number[],
): Promise<typeof mealPlansTable.$inferSelect | null> {
  if (propertyIds.length === 0) return null;
  const [plan] = await db
    .select()
    .from(mealPlansTable)
    .where(and(eq(mealPlansTable.id, mealPlanId), inArray(mealPlansTable.propertyId, propertyIds)))
    .limit(1);
  return plan ?? null;
}

router.get("/meal-ratings", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const mealPlanId = Number(req.query.mealPlanId);
    if (!mealPlanId || isNaN(mealPlanId)) {
      res.status(400).json({ error: "mealPlanId required" });
      return;
    }

    const plan = await resolveAuthorizedMealPlan(mealPlanId, scope.propertyIds);
    if (!plan) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const rows = await db
      .select()
      .from(mealRatingsTable)
      .where(eq(mealRatingsTable.mealPlanId, mealPlanId));
    res.json(rows.map(ratingToJson));
  } catch (err) {
    req.log.error({ err }, "Failed to get meal ratings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/meal-ratings", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const { mealPlanId, memberId, rating } = req.body ?? {};
    if (!mealPlanId || !memberId || !rating) {
      res.status(400).json({ error: "mealPlanId, memberId, rating required" });
      return;
    }
    if (!VALID_RATINGS.includes(rating)) {
      res.status(400).json({ error: "rating must be love | ok | skip" });
      return;
    }
    const mealPlanIdNum = Number(mealPlanId);
    const memberIdNum = Number(memberId);
    if (isNaN(mealPlanIdNum) || isNaN(memberIdNum)) {
      res.status(400).json({ error: "Invalid mealPlanId or memberId" });
      return;
    }

    const plan = await resolveAuthorizedMealPlan(mealPlanIdNum, scope.propertyIds);
    if (!plan) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [member] = await db
      .select()
      .from(familyMembersTable)
      .where(and(eq(familyMembersTable.id, memberIdNum), eq(familyMembersTable.householdId, scope.householdId)))
      .limit(1);
    if (!member) {
      res.status(403).json({ error: "Member not authorized" });
      return;
    }

    // Upsert: update if exists, insert if not
    const existing = await db
      .select()
      .from(mealRatingsTable)
      .where(and(eq(mealRatingsTable.mealPlanId, mealPlanIdNum), eq(mealRatingsTable.memberId, memberIdNum)))
      .limit(1);

    let row: any;
    if (existing.length > 0) {
      const [updated] = await db
        .update(mealRatingsTable)
        .set({ rating })
        .where(eq(mealRatingsTable.id, existing[0].id))
        .returning();
      row = updated;
    } else {
      const [inserted] = await db
        .insert(mealRatingsTable)
        .values({ mealPlanId: mealPlanIdNum, memberId: memberIdNum, rating })
        .returning();
      row = inserted;
    }

    res.json(ratingToJson(row));
  } catch (err) {
    req.log.error({ err }, "Failed to upsert meal rating");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/meal-ratings/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [row] = await db
      .select({ rating: mealRatingsTable })
      .from(mealRatingsTable)
      .innerJoin(mealPlansTable, eq(mealRatingsTable.mealPlanId, mealPlansTable.id))
      .where(and(eq(mealRatingsTable.id, id), inArray(mealPlansTable.propertyId, scope.propertyIds)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(mealRatingsTable).where(eq(mealRatingsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete meal rating");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
