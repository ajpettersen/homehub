import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { mealPlansTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

const router = Router();

// POST /ai/scan-pantry
// Accepts a base64 image of fridge/pantry, returns identified ingredients + meal suggestions
router.post("/ai/scan-pantry", async (req, res) => {
  try {
    const { imageBase64 } = req.body as { imageBase64: string };

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    // Pull recent meal history for context
    const recentMeals = await db
      .select({ meal: mealPlansTable.meal })
      .from(mealPlansTable)
      .orderBy(desc(mealPlansTable.createdAt))
      .limit(30);

    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))].slice(0, 20);

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "low",
              },
            },
            {
              type: "text",
              text: `You are a helpful family meal planner. Look at this photo of a fridge or pantry and identify the ingredients you can see.

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
