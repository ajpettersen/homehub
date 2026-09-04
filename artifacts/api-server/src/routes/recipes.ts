import { Router } from "express";
import { db } from "@workspace/db";
import { recipesTable } from "@workspace/db";
import { and, eq, desc, inArray } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();
const MAX_INGREDIENTS = 100;
const MAX_INSTRUCTIONS = 100;
const MAX_NAME_LENGTH = 300;
const MAX_NOTES_LENGTH = 10_000;
const MAX_STEP_LENGTH = 2_000;
const MAX_SOURCE_URL_LENGTH = 2_048;
const MAX_QUANTITY_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 80;
const SOURCE_TYPES = ["manual", "image", "url", "ai"] as const;

export type StructuredRecipeContent = {
  ingredients?: Array<{ name: string; quantity?: string; category?: string }>;
  instructions?: string[];
  servings?: number | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  sourceType?: (typeof SOURCE_TYPES)[number] | null;
};

/** Validate only client-editable recipe content before it reaches JSONB storage. */
export function validateStructuredRecipeContent(
  body: Record<string, unknown>,
): { value?: StructuredRecipeContent; error?: string } {
  const value: StructuredRecipeContent = {};
  if (body.ingredients !== undefined) {
    if (!Array.isArray(body.ingredients) || body.ingredients.length > MAX_INGREDIENTS) {
      return { error: `ingredients must be an array of at most ${MAX_INGREDIENTS} items` };
    }
    const ingredients = [];
    for (const item of body.ingredients) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { error: "each ingredient must be an object" };
      }
      const { name, quantity, category } = item as Record<string, unknown>;
      if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LENGTH) {
        return { error: "each ingredient name must be a non-empty string up to 300 characters" };
      }
      if (quantity !== undefined && (typeof quantity !== "string" || quantity.length > MAX_QUANTITY_LENGTH)) {
        return { error: "ingredient quantity must be a string up to 100 characters" };
      }
      if (category !== undefined && (typeof category !== "string" || category.length > MAX_CATEGORY_LENGTH)) {
        return { error: "ingredient category must be a string up to 80 characters" };
      }
      ingredients.push({
        name: name.trim(),
        ...(typeof quantity === "string" && quantity.trim() ? { quantity: quantity.trim() } : {}),
        ...(typeof category === "string" && category.trim() ? { category: category.trim() } : {}),
      });
    }
    value.ingredients = ingredients;
  }
  if (body.instructions !== undefined) {
    if (!Array.isArray(body.instructions) || body.instructions.length > MAX_INSTRUCTIONS ||
      body.instructions.some((step) => typeof step !== "string" || !step.trim() || step.length > MAX_STEP_LENGTH)) {
      return { error: `instructions must contain at most ${MAX_INSTRUCTIONS} non-empty steps of up to ${MAX_STEP_LENGTH} characters` };
    }
    value.instructions = body.instructions.map((step) => step.trim());
  }
  for (const key of ["servings", "prepMinutes", "cookMinutes"] as const) {
    const raw = body[key];
    if (raw !== undefined) {
      if (raw !== null && (typeof raw !== "number" || !Number.isInteger(raw) || raw < (key === "servings" ? 1 : 0) || raw > (key === "servings" ? 100 : 1440))) {
        return { error: `${key} must be ${key === "servings" ? "an integer from 1 to 100" : "an integer from 0 to 1440"} or null` };
      }
      value[key] = raw as number | null;
    }
  }
  if (body.sourceType !== undefined) {
    if (body.sourceType !== null && (typeof body.sourceType !== "string" || !SOURCE_TYPES.includes(body.sourceType as typeof SOURCE_TYPES[number]))) {
      return { error: "sourceType must be manual, image, url, ai, or null" };
    }
    value.sourceType = body.sourceType as StructuredRecipeContent["sourceType"];
  }
  return { value };
}

function recipeToJson(r: typeof recipesTable.$inferSelect) {
  return {
    id: String(r.id),
    propertyId: String(r.propertyId),
    name: r.name,
    sourceUrl: r.sourceUrl ?? null,
    notes: r.notes ?? null,
    timesCooked: r.timesCooked ?? 0,
    aggregateRating: r.aggregateRating ?? null,
    ingredients: r.ingredients ?? [],
    instructions: r.instructions ?? [],
    servings: r.servings ?? null,
    prepMinutes: r.prepMinutes ?? null,
    cookMinutes: r.cookMinutes ?? null,
    sourceType: r.sourceType ?? null,
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

  const body = req.body ?? {};
  const { name, propertyId, sourceUrl, notes } = body;
  if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LENGTH || !propertyId) {
    res.status(400).json({ error: "name and propertyId are required" });
    return;
  }
  if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH)) {
    res.status(400).json({ error: "notes must be a string up to 10000 characters" });
    return;
  }
  const structured = validateStructuredRecipeContent(body);
  if (structured.error) {
    res.status(400).json({ error: structured.error });
    return;
  }

  try {
    if (!scope.propertyIds.includes(Number(propertyId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Validate sourceUrl to prevent javascript: and other non-HTTP schemes (XSS)
    const safeUrl = sourceUrl && String(sourceUrl).length <= MAX_SOURCE_URL_LENGTH ? validateHttpUrl(String(sourceUrl)) : null;
    if (sourceUrl && !safeUrl) {
      res.status(400).json({ error: "sourceUrl must be an http or https URL" });
      return;
    }

    const [row] = await db
      .insert(recipesTable)
      .values({
        name: name.trim(),
        propertyId: Number(propertyId),
        sourceUrl: safeUrl,
        notes: notes ?? null,
        ...structured.value,
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

  const body = req.body ?? {};
  const { name, sourceUrl, notes, timesCooked, aggregateRating } = body;
  const VALID_RATINGS = ["love", "ok", "skip", null];

  if (aggregateRating !== undefined && !VALID_RATINGS.includes(aggregateRating)) {
    res.status(400).json({ error: "aggregateRating must be love | ok | skip | null" });
    return;
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LENGTH)) {
    res.status(400).json({ error: "name must be a non-empty string up to 300 characters" });
    return;
  }
  if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH)) {
    res.status(400).json({ error: "notes must be a string up to 10000 characters" });
    return;
  }
  if (timesCooked !== undefined && (!Number.isInteger(timesCooked) || timesCooked < 0 || timesCooked > 100_000)) {
    res.status(400).json({ error: "timesCooked must be an integer from 0 to 100000" });
    return;
  }
  const structured = validateStructuredRecipeContent(body);
  if (structured.error) {
    res.status(400).json({ error: structured.error });
    return;
  }

  try {
    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Validate sourceUrl to prevent javascript: and other non-HTTP schemes (XSS)
    if (sourceUrl !== undefined && sourceUrl !== null) {
      if (typeof sourceUrl !== "string" || sourceUrl.length > MAX_SOURCE_URL_LENGTH) {
        res.status(400).json({ error: "sourceUrl must be an http or https URL up to 2048 characters" });
        return;
      }
      const safeUrl = validateHttpUrl(String(sourceUrl));
      if (!safeUrl) {
        res.status(400).json({ error: "sourceUrl must be an http or https URL" });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (sourceUrl !== undefined) {
      updates.sourceUrl = sourceUrl ? (validateHttpUrl(String(sourceUrl)) ?? null) : null;
    }
    if (notes !== undefined) updates.notes = notes ?? null;
    if (timesCooked !== undefined) updates.timesCooked = Number(timesCooked);
    if (aggregateRating !== undefined) updates.aggregateRating = aggregateRating;
    Object.assign(updates, structured.value);

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
