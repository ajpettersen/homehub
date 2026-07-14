import { Router } from "express";
import { db } from "@workspace/db";
import { mealPlansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/meal-plans", async (req, res) => {
  try {
    const { weekStart } = req.query;

    let query = db.select().from(mealPlansTable);
    if (weekStart) {
      query = query.where(eq(mealPlansTable.weekStart, String(weekStart))) as typeof query;
    }

    const entries = await query.orderBy(mealPlansTable.dayOfWeek, mealPlansTable.mealType);

    res.json(
      entries.map((e) => ({
        id: String(e.id),
        weekStart: e.weekStart,
        dayOfWeek: e.dayOfWeek,
        mealType: e.mealType,
        meal: e.meal,
        notes: e.notes ?? null,
        propertyId: String(e.propertyId),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get meal plans");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/meal-plans", async (req, res) => {
  try {
    const { weekStart, dayOfWeek, mealType, meal, notes, propertyId } = req.body;
    if (!weekStart || dayOfWeek === undefined || !mealType || !meal || !propertyId) {
      return res.status(400).json({ error: "weekStart, dayOfWeek, mealType, meal, propertyId required" });
    }

    const [entry] = await db
      .insert(mealPlansTable)
      .values({
        weekStart,
        dayOfWeek: Number(dayOfWeek),
        mealType,
        meal,
        notes: notes ?? null,
        propertyId: Number(propertyId),
      })
      .returning();

    res.status(201).json({
      id: String(entry.id),
      weekStart: entry.weekStart,
      dayOfWeek: entry.dayOfWeek,
      mealType: entry.mealType,
      meal: entry.meal,
      notes: entry.notes ?? null,
      propertyId: String(entry.propertyId),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create meal plan entry");
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
