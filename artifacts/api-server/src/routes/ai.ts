import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { mealPlansTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

const router = Router();

/** Detect MIME type from a base64 string (with or without data-URI prefix). */
function detectMimeType(b64: string): string {
  if (b64.startsWith("data:")) {
    const m = b64.match(/^data:([^;]+);base64,/);
    return m?.[1] ?? "image/jpeg";
  }
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

/** Strip a data-URI prefix if present, returning raw base64. */
function stripPrefix(b64: string): string {
  return b64.startsWith("data:") ? b64.replace(/^data:[^;]+;base64,/, "") : b64;
}

// POST /ai/scan-pantry
// Accepts one or more base64 photos of fridge/pantry, returns ingredient list + meal suggestions
router.post("/ai/scan-pantry", async (req, res) => {
  try {
    const { imagesBase64 } = req.body as { imagesBase64: string[] };

    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
      res.status(400).json({ error: "imagesBase64 must be a non-empty array" });
      return;
    }

    // Pull recent meal history for context
    const recentMeals = await db
      .select({ meal: mealPlansTable.meal })
      .from(mealPlansTable)
      .orderBy(desc(mealPlansTable.createdAt))
      .limit(30);

    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))].slice(0, 20);

    // Build one image_url entry per photo
    const imageContent = imagesBase64.map((raw) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${detectMimeType(raw)};base64,${stripPrefix(raw)}`,
        detail: "low" as const,
      },
    }));

    const photoWord = imagesBase64.length === 1 ? "photo" : `${imagesBase64.length} photos`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text",
              text: `You are a helpful family meal planner. Look at ${photoWord === "1 photo" ? "this photo" : "these photos"} of a fridge or pantry and identify ALL the ingredients you can see across all images.

Then suggest 4 family-friendly dinner ideas that use as many of these ingredients as possible. This is for a family with kids aged 5-10, so meals should be approachable.

${mealHistory.length > 0 ? `Recent meals to avoid repeating: ${mealHistory.join(", ")}` : ""}

Respond ONLY with valid JSON in this exact format:
{
  "ingredients": ["ingredient1", "ingredient2", ...],
  "mealSuggestions": [
    {
      "name": "Meal Name",
      "description": "One sentence description",
      "usesIngredients": ["ing1", "ing2"],
      "missingIngredients": ["thing you need to buy"]
    }
  ]
}`,
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    console.error("Pantry scan error:", err);
    res.status(500).json({ error: "Failed to scan pantry" });
  }
});

// POST /ai/suggest-meals
// Returns meal suggestions based on meal history (no photo required)
router.post("/ai/suggest-meals", async (req, res) => {
  try {
    const recentMeals = await db
      .select({ meal: mealPlansTable.meal })
      .from(mealPlansTable)
      .orderBy(desc(mealPlansTable.createdAt))
      .limit(40);

    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))];

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a family meal planner. Based on this family's meal history, suggest 5 dinner ideas for this week.

Meal history: ${mealHistory.length > 0 ? mealHistory.join(", ") : "No history yet — suggest popular family-friendly dinners"}

Family has kids aged 5-10. Suggest a variety: one pasta, one protein+veg, one comfort food, one quick weeknight, one fun/weekend meal.
Avoid repeating recent meals.

Respond ONLY with valid JSON:
{
  "mealSuggestions": [
    {
      "name": "Meal Name",
      "description": "One sentence why the family will love it",
      "missingIngredients": ["common ingredient you'd likely need to buy"]
    }
  ]
}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }

    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("Meal suggest error:", err);
    res.status(500).json({ error: "Failed to suggest meals" });
  }
});

export default router;
