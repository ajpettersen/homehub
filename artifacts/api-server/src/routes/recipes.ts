import { Router } from "express";
import { db } from "@workspace/db";
import { recipesTable } from "@workspace/db";
import { and, eq, desc, inArray } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();

function recipeToJson(r: typeof recipesTable.$inferSelect) {
  return {
    id: String(r.id),
    propertyId: String(r.propertyId),
    name: r.name,
    sourceUrl: r.sourceUrl ?? null,
    notes: r.notes ?? null,
    timesCooked: r.timesCooked ?? 0,
    aggregateRating: r.aggregateRating ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

/** Validate that a URL is http or https only (blocks javascript: and other schemes). */
function validateHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// GET /recipes?propertyId=…  — scoped to an authorized household
router.get("/recipes", async (req, res): Promise<void> => {
  const scope = getApprovedHouseholdScope(res);

  const { propertyId } = req.query;
  if (!propertyId) {
    res.status(400).json({ error: "propertyId query param is required" });
    return;
  }

  try {
    if (!scope.propertyIds.includes(Number(propertyId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rows = await db
      .select()
      .from(recipesTable)
      .where(eq(recipesTable.propertyId, Number(propertyId)))
      .orderBy(desc(recipesTable.createdAt));
    res.json(rows.map(recipeToJson));
  } catch (err) {
    req.log.error({ err }, "Failed to get recipes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /recipes
router.post("/recipes", async (req, res): Promise<void> => {
  const scope = getApprovedHouseholdScope(res);

  const { name, propertyId, sourceUrl, notes } = req.body;
  if (!name || !propertyId) {
    res.status(400).json({ error: "name and propertyId are required" });
    return;
  }

  try {
    if (!scope.propertyIds.includes(Number(propertyId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Validate sourceUrl to prevent javascript: and other non-HTTP schemes (XSS)
    const safeUrl = sourceUrl ? validateHttpUrl(String(sourceUrl)) : null;
    if (sourceUrl && !safeUrl) {
      res.status(400).json({ error: "sourceUrl must be an http or https URL" });
      return;
    }

    const [row] = await db
      .insert(recipesTable)
      .values({
        name,
        propertyId: Number(propertyId),
        sourceUrl: safeUrl,
        notes: notes ?? null,
      })
      .returning();
    res.status(201).json(recipeToJson(row));
  } catch (err) {
    req.log.error({ err }, "Failed to create recipe");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /recipes/:id — update notes, timesCooked, aggregateRating
router.put("/recipes/:id", async (req, res): Promise<void> => {
  const scope = getApprovedHouseholdScope(res);

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { name, sourceUrl, notes, timesCooked, aggregateRating } = req.body ?? {};
  const VALID_RATINGS = ["love", "ok", "skip", null];

  if (aggregateRating !== undefined && !VALID_RATINGS.includes(aggregateRating)) {
    res.status(400).json({ error: "aggregateRating must be love | ok | skip | null" });
    return;
  }

  try {
    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Validate sourceUrl to prevent javascript: and other non-HTTP schemes (XSS)
    if (sourceUrl !== undefined && sourceUrl !== null) {
      const safeUrl = validateHttpUrl(String(sourceUrl));
      if (!safeUrl) {
        res.status(400).json({ error: "sourceUrl must be an http or https URL" });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (sourceUrl !== undefined) {
      updates.sourceUrl = sourceUrl ? (validateHttpUrl(String(sourceUrl)) ?? null) : null;
    }
    if (notes !== undefined) updates.notes = notes ?? null;
    if (timesCooked !== undefined) updates.timesCooked = Number(timesCooked);
    if (aggregateRating !== undefined) updates.aggregateRating = aggregateRating;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    // Update atomically constrained to the authorized property scope so a recipe
    // belonging to another household is never mutated.
    const [row] = await db
      .update(recipesTable)
      .set(updates)
      .where(
        and(
          eq(recipesTable.id, id),
          inArray(recipesTable.propertyId, scope.propertyIds),
        ),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(recipeToJson(row));
  } catch (err) {
    req.log.error({ err }, "Failed to update recipe");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /recipes/:id
router.delete("/recipes/:id", async (req, res): Promise<void> => {
  const scope = getApprovedHouseholdScope(res);

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  try {
    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Delete atomically constrained to the authorized property scope.
    const deleted = await db
      .delete(recipesTable)
      .where(
        and(
          eq(recipesTable.id, id),
          inArray(recipesTable.propertyId, scope.propertyIds),
        ),
      )
      .returning({ id: recipesTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete recipe");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
