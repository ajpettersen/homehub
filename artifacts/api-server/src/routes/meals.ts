import { Router } from "express";
import { db } from "@workspace/db";
import { mealPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
      return res.status(400).json({ error: "weekStart, dayOfWeek, mealType, meal, propertyId required" });
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
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const { rating, notes } = req.body ?? {};
    const VALID_RATINGS = ["love", "ok", "skip", null];

    const updates: Record<string, unknown> = {};
    if (rating !== undefined) {
      if (!VALID_RATINGS.includes(rating)) return res.status(400).json({ error: "rating must be love | ok | skip | null" });
      updates.rating = rating;
    }
    if (notes !== undefined) updates.notes = notes ?? null;

    const [entry] = await db.update(mealPlansTable).set(updates).where(eq(mealPlansTable.id, id)).returning();
    if (!entry) return res.status(404).json({ error: "Not found" });
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

export default router;
