import { Router } from "express";
import { db } from "@workspace/db";
import { mealPlansTable, mealRatingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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
    const { weekStart } = req.query;
    let query = db.select().from(mealPlansTable);
    if (weekStart) {
      query = query.where(eq(mealPlansTable.weekStart, String(weekStart))) as typeof query;
    }
    const entries = await query.orderBy(mealPlansTable.dayOfWeek, mealPlansTable.mealType);
    res.json(entries.map(entryToJson));
  } catch (err) {
    req.log.error({ err }, "Failed to get meal plans");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/meal-plans", async (req, res) => {
  try {
    const { weekStart, dayOfWeek, mealType, meal, notes, rating, propertyId } = req.body;
    if (!weekStart || dayOfWeek === undefined || !mealType || !meal || !propertyId) {
      res.status(400).json({ error: "weekStart, dayOfWeek, mealType, meal, propertyId required" });
      return;
    }
    const [entry] = await db
      .insert(mealPlansTable)
      .values({ weekStart, dayOfWeek: Number(dayOfWeek), mealType, meal, notes: notes ?? null, rating: rating ?? null, propertyId: Number(propertyId) })
      .returning();
    res.status(201).json(entryToJson(entry));
  } catch (err) {
    req.log.error({ err }, "Failed to create meal plan entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/meal-plans/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rating, notes } = req.body ?? {};
    const VALID_RATINGS = ["love", "ok", "skip", null];

    const updates: Record<string, unknown> = {};
    if (rating !== undefined) {
      if (!VALID_RATINGS.includes(rating)) {
        res.status(400).json({ error: "rating must be love | ok | skip | null" });
        return;
      }
      updates.rating = rating;
    }
    if (notes !== undefined) updates.notes = notes ?? null;

    const [entry] = await db.update(mealPlansTable).set(updates).where(eq(mealPlansTable.id, id)).returning();
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
    await db.delete(mealPlansTable).where(eq(mealPlansTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete meal plan entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Per-member meal ratings ───────────────────────────────────────────────────

const VALID_RATINGS = ["love", "ok", "skip"];

router.get("/meal-ratings", async (req, res) => {
  try {
    const mealPlanId = Number(req.query.mealPlanId);
    if (!mealPlanId || isNaN(mealPlanId)) {
      res.status(400).json({ error: "mealPlanId required" });
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
    const { mealPlanId, memberId, rating } = req.body ?? {};
    if (!mealPlanId || !memberId || !rating) {
      res.status(400).json({ error: "mealPlanId, memberId, rating required" });
      return;
    }
    if (!VALID_RATINGS.includes(rating)) {
      res.status(400).json({ error: "rating must be love | ok | skip" });
      return;
    }

    // Upsert: update if exists, insert if not
    const existing = await db
      .select()
      .from(mealRatingsTable)
      .where(and(eq(mealRatingsTable.mealPlanId, Number(mealPlanId)), eq(mealRatingsTable.memberId, Number(memberId))))
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
        .values({ mealPlanId: Number(mealPlanId), memberId: Number(memberId), rating })
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
    await db.delete(mealRatingsTable).where(eq(mealRatingsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete meal rating");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
