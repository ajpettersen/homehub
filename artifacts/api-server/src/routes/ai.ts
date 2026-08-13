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

// POST /ai/meal-recipe
// Returns a full recipe for a named meal, plus an optional AI-generated food photo
router.post("/ai/meal-recipe", async (req, res) => {
  try {
    const { meal, generateImage } = req.body as { meal: string; generateImage?: boolean };

    if (!meal || typeof meal !== "string") {
      res.status(400).json({ error: "meal is required" });
      return;
    }

    // Generate recipe via GPT
    const recipeResp = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are a family meal planner for a family with kids aged 5-10 (Holden 10, Brody 8, Daphne 5).
Generate a complete recipe for: "${meal}"

Make it approachable, kid-friendly where possible, and realistic for a weeknight dinner.

Respond ONLY with valid JSON:
{
  "prepTime": "15 mins",
  "cookTime": "30 mins",
  "servings": 5,
  "difficulty": "Easy",
  "ingredients": [
    "2 lbs chicken breast",
    "1 cup pasta sauce"
  ],
  "steps": [
    "Preheat oven to 375°F.",
    "Season chicken with salt and pepper."
  ],
  "tips": "Optional single tip for best results"
}`,
        },
      ],
    });

    const recipeContent = recipeResp.choices[0]?.message?.content ?? "";
    const recipeMatch = recipeContent.match(/\{[\s\S]*\}/);
    if (!recipeMatch) {
      res.status(500).json({ error: "Failed to parse recipe" });
      return;
    }
    const recipe = JSON.parse(recipeMatch[0]);

    // Optionally generate a food photo
    let imageBase64: string | undefined;
    if (generateImage) {
      try {
        const { generateImageBuffer } = await import("@workspace/integrations-openai-ai-server/image");
        const buffer = await generateImageBuffer(
          `Professional food photography of ${meal}, plated beautifully on a family dinner table, warm natural lighting, appetizing`,
          "1024x1024"
        );
        imageBase64 = buffer.toString("base64");
      } catch (imgErr) {
        console.error("Image generation failed:", imgErr);
        // Non-fatal — return recipe without image
      }
    }

    res.json({ recipe, ...(imageBase64 ? { imageBase64 } : {}) });
  } catch (err) {
    console.error("Meal recipe error:", err);
    res.status(500).json({ error: "Failed to get recipe" });
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

// POST /ai/suggest-week
// Returns a full week of meal suggestions (breakfast, lunch, dinner × 7 days)
router.post("/ai/suggest-week", async (req, res) => {
  try {
    const recentMeals = await db
      .select({ meal: mealPlansTable.meal })
      .from(mealPlansTable)
      .orderBy(desc(mealPlansTable.createdAt))
      .limit(60);

    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))];

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are a family meal planner for AJ and Emily, who have 3 kids (ages 5, 8, 10). 
Plan a full week of meals (Monday–Sunday) covering breakfast, lunch, and dinner each day.

Goals:
- Reduce food waste: reuse ingredients across multiple meals where sensible
- Variety: don't repeat the same protein two days in a row
- Practical: breakfasts and lunches should be quick; dinners can be more involved
- Kid-friendly dinners that adults will also enjoy

${mealHistory.length > 0 ? `Recent meals to avoid: ${mealHistory.slice(0, 20).join(", ")}` : ""}

Respond ONLY with valid JSON — no markdown, no extra text:
{
  "days": [
    {
      "dayName": "Monday",
      "breakfast": "Scrambled eggs & toast",
      "lunch": "Turkey sandwiches",
      "dinner": "Sheet pan chicken thighs & roasted veggies"
    },
    ...7 items total, Monday through Sunday
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
    console.error("Suggest week error:", err);
    res.status(500).json({ error: "Failed to suggest week" });
  }
});

export default router;
