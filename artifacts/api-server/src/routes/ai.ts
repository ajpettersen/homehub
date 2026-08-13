import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { mealPlansTable } from "@workspace/db/schema";
import { desc, eq, and, isNotNull } from "drizzle-orm";

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

/** Fetch and trim a webpage for AI consumption (max ~8 000 chars). */
async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; HomeHub/1.0)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // Strip tags and collapse whitespace
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.slice(0, 8000);
}

// ── POST /ai/scan-pantry ─────────────────────────────────────────────────────
router.post("/ai/scan-pantry", async (req, res) => {
  try {
    const { imagesBase64 } = req.body as { imagesBase64: string[] };
    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
      res.status(400).json({ error: "imagesBase64 must be a non-empty array" });
      return;
    }

    const recentMeals = await db.select({ meal: mealPlansTable.meal }).from(mealPlansTable).orderBy(desc(mealPlansTable.createdAt)).limit(30);
    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))].slice(0, 20);

    const imageContent = imagesBase64.map((raw) => ({
      type: "image_url" as const,
      image_url: { url: `data:${detectMimeType(raw)};base64,${stripPrefix(raw)}`, detail: "low" as const },
    }));

    const photoWord = imagesBase64.length === 1 ? "photo" : `${imagesBase64.length} photos`;
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [{
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
      }],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "Failed to parse AI response" }); return; }
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("Pantry scan error:", err);
    res.status(500).json({ error: "Failed to scan pantry" });
  }
});

// ── POST /ai/meal-recipe ─────────────────────────────────────────────────────
router.post("/ai/meal-recipe", async (req, res) => {
  try {
    const { meal, generateImage } = req.body as { meal: string; generateImage?: boolean };
    if (!meal || typeof meal !== "string") {
      res.status(400).json({ error: "meal is required" });
      return;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1500,
      messages: [{
        role: "user",
        content: `Generate a detailed, family-friendly recipe for "${meal}". This is for a family with kids aged 5, 8, and 10.

Respond ONLY with valid JSON in this exact format:
{
  "name": "Full Recipe Name",
  "description": "2-3 sentence description",
  "servings": 4,
  "prepMinutes": 15,
  "cookMinutes": 30,
  "ingredients": [{"amount": "2 cups", "item": "flour"}, ...],
  "steps": ["Step 1...", "Step 2...", ...],
  "kidFriendlyTips": "Optional tip for making this more kid-friendly",
  "nutrition": {"calories": 450, "protein": "25g", "carbs": "35g", "fat": "18g"}
}`,
      }],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "Failed to parse AI response" }); return; }
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("Meal recipe error:", err);
    res.status(500).json({ error: "Failed to generate recipe" });
  }
});

// ── POST /ai/suggest-week ────────────────────────────────────────────────────
// Returns Mon–Sun meal suggestions, informed by past ratings
router.post("/ai/suggest-week", async (req, res) => {
  try {
    // Pull recent meal history
    const recentMeals = await db.select({ meal: mealPlansTable.meal }).from(mealPlansTable).orderBy(desc(mealPlansTable.createdAt)).limit(60);
    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))];

    // Pull rated meals for preference learning
    const ratedMeals = await db
      .select({ meal: mealPlansTable.meal, rating: mealPlansTable.rating })
      .from(mealPlansTable)
      .where(isNotNull(mealPlansTable.rating))
      .orderBy(desc(mealPlansTable.createdAt))
      .limit(100);

    const loved = [...new Set(ratedMeals.filter(m => m.rating === "love").map(m => m.meal))].slice(0, 15);
    const skipped = [...new Set(ratedMeals.filter(m => m.rating === "skip").map(m => m.meal))].slice(0, 15);

    const preferenceLines: string[] = [];
    if (loved.length > 0) preferenceLines.push(`Family favorites (suggest similar meals): ${loved.join(", ")}`);
    if (skipped.length > 0) preferenceLines.push(`Family dislikes (avoid these and similar meals): ${skipped.join(", ")}`);

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [{
        role: "user",
        content: `You are a family meal planner for AJ and Emily, who have 3 kids (ages 5, 8, 10).
Plan a full week of meals (Monday–Sunday) covering breakfast, lunch, and dinner each day.

Goals:
- Reduce food waste: reuse ingredients across multiple meals where sensible
- Variety: don't repeat the same protein two days in a row
- Practical: breakfasts and lunches should be quick; dinners can be more involved
- Kid-friendly dinners that adults will also enjoy

${preferenceLines.length > 0 ? `\nFamily preferences based on past ratings:\n${preferenceLines.join("\n")}\n` : ""}
${mealHistory.length > 0 ? `\nRecent meals to avoid repeating: ${mealHistory.slice(0, 20).join(", ")}` : ""}

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
      }],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "Failed to parse AI response" }); return; }
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("Suggest week error:", err);
    res.status(500).json({ error: "Failed to suggest week" });
  }
});

// ── POST /ai/extract-recipe-url ──────────────────────────────────────────────
// Fetches a recipe page and uses AI to extract the meal name + summary
router.post("/ai/extract-recipe-url", async (req, res) => {
  try {
    const { url } = req.body as { url: string };
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url is required" });
    }

    let pageText: string;
    try {
      pageText = await fetchPageText(url);
    } catch {
      return res.status(422).json({ error: "Could not fetch that URL. Make sure it's a public recipe page." });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 512,
      messages: [{
        role: "user",
        content: `This is the text content of a recipe webpage. Extract the recipe information.

PAGE TEXT:
${pageText}

Respond ONLY with valid JSON:
{
  "name": "Recipe Name (short, suitable as a meal plan entry)",
  "description": "One sentence description of the dish",
  "servings": 4,
  "source": "Site name or author if found, otherwise null"
}

If this does not appear to be a recipe page, respond with:
{ "error": "Not a recipe page" }`,
      }],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "Failed to parse AI response" });

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.error) return res.status(422).json({ error: parsed.error });

    res.json(parsed);
  } catch (err) {
    console.error("Extract recipe URL error:", err);
    res.status(500).json({ error: "Failed to extract recipe" });
  }
});

export default router;
