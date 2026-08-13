import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { mealPlansTable, aiMemoriesTable } from "@workspace/db/schema";
import { desc, isNotNull } from "drizzle-orm";

// ── Memory helpers ───────────────────────────────────────────────────────────

/** Load all stored memories from DB and format as a prompt section. */
async function getMemoriesContext(): Promise<string> {
  try {
    const rows = await db.select().from(aiMemoriesTable).orderBy(aiMemoriesTable.createdAt);
    if (rows.length === 0) return "";
    const lines = rows.map(r => `- ${r.content}`).join("\n");
    return `\nThings already known about this family (use these to personalize every response):\n${lines}\n`;
  } catch {
    return "";
  }
}

/** Extract and persist new memory facts from a conversation exchange (fire-and-forget). */
function extractAndSaveMemories(
  userMessage: string,
  assistantReply: string,
  existingMemories: string[]
): Promise<string[]> {
  return (async () => {
    try {
      const existingList = existingMemories.length > 0
        ? `Already known:\n${existingMemories.map(m => `- ${m}`).join("\n")}`
        : "Nothing stored yet.";

      const res = await openai.chat.completions.create({
        model: "gpt-5.6-luna",
        max_completion_tokens: 256,
        messages: [
          {
            role: "system",
            content: `You extract durable household preferences and facts from conversations. Be concise. Only save truly useful personalisation facts (preferences, dislikes, goals, constraints). Do NOT save one-off questions or generic chat.`,
          },
          {
            role: "user",
            content: `User said: "${userMessage}"\nAssistant replied: "${assistantReply.slice(0, 400)}"\n\n${existingList}\n\nList 0–3 NEW facts worth remembering (not already in the list above). Each on its own line starting with "-". If nothing new, reply exactly: NONE`,
          },
        ],
      });

      const text = res.choices[0]?.message?.content ?? "NONE";
      if (text.trim() === "NONE") return [];

      const newFacts = text
        .split("\n")
        .map(l => l.replace(/^[-•*]\s*/, "").trim())
        .filter(l => l.length > 4 && l.length < 200);

      for (const content of newFacts) {
        await db.insert(aiMemoriesTable).values({ content, category: "general" });
      }
      return newFacts;
    } catch {
      return [];
    }
  })();
}

// Valid grocery categories (must match client-side ALL_CATEGORIES keys)
const VALID_CATEGORIES = [
  "produce", "deli", "meat", "dairy", "bread",
  "grains", "canned", "snacks", "frozen", "beverages", "household", "other",
];

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
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.slice(0, 8000);
}

// ── POST /ai/scan-pantry ─────────────────────────────────────────────────────
// Accepts one or more base64 photos of fridge/pantry, returns ingredient list + meal suggestions
router.post("/ai/scan-pantry", async (req, res) => {
  try {
    const { imagesBase64 } = req.body as { imagesBase64: string[] };

    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
      res.status(400).json({ error: "imagesBase64 must be a non-empty array" });
      return;
    }

    const recentMeals = await db
      .select({ meal: mealPlansTable.meal })
      .from(mealPlansTable)
      .orderBy(desc(mealPlansTable.createdAt))
      .limit(60);

    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))];

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
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }

    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("Pantry scan error:", err);
    res.status(500).json({ error: "Failed to scan pantry" });
  }
});

// ── POST /ai/meal-recipe ─────────────────────────────────────────────────────
// Returns a full recipe for a named meal, plus an optional AI-generated food photo
router.post("/ai/meal-recipe", async (req, res) => {
  try {
    const { meal, generateImage } = req.body as { meal: string; generateImage?: boolean };

    if (!meal || typeof meal !== "string") {
      res.status(400).json({ error: "meal is required" });
      return;
    }

    const memoriesCtx = await getMemoriesContext();

    const recipeResp = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are a family meal planner for a family with kids aged 5-10 (Holden 10, Brody 8, Daphne 5).
Generate a complete recipe for: "${meal}"
${memoriesCtx}
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
      }
    }

    res.json({ recipe, ...(imageBase64 ? { imageBase64 } : {}) });
  } catch (err) {
    console.error("Meal recipe error:", err);
    res.status(500).json({ error: "Failed to get recipe" });
  }
});

// ── POST /ai/suggest-week ────────────────────────────────────────────────────
// Returns Mon–Sun meal suggestions, informed by past ratings + stored memories
router.post("/ai/suggest-week", async (req, res) => {
  try {
    const [recentMeals, ratedMeals, memoriesCtx] = await Promise.all([
      db.select({ meal: mealPlansTable.meal }).from(mealPlansTable).orderBy(desc(mealPlansTable.createdAt)).limit(60),
      db.select({ meal: mealPlansTable.meal, rating: mealPlansTable.rating }).from(mealPlansTable).where(isNotNull(mealPlansTable.rating)).orderBy(desc(mealPlansTable.createdAt)).limit(100),
      getMemoriesContext(),
    ]);

    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))];
    const loved = [...new Set(ratedMeals.filter(m => m.rating === "love").map(m => m.meal))].slice(0, 15);
    const skipped = [...new Set(ratedMeals.filter(m => m.rating === "skip").map(m => m.meal))].slice(0, 15);

    const preferenceLines: string[] = [];
    if (loved.length > 0) preferenceLines.push(`Family favorites (suggest similar meals): ${loved.join(", ")}`);
    if (skipped.length > 0) preferenceLines.push(`Family dislikes (avoid these and similar meals): ${skipped.join(", ")}`);

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are a family meal planner for AJ and Emily, who have 3 kids (Holden 10, Brody 8, Daphne 5).
Plan a full week of meals (Monday–Sunday) covering breakfast, lunch, and dinner each day.
${memoriesCtx}
Goals:
- Reduce food waste: reuse ingredients across multiple meals where sensible
- Variety: don't repeat the same protein two days in a row
- Practical: breakfasts and lunches should be quick; dinners can be more involved
- Kid-friendly dinners that adults will also enjoy

${mealHistory.length > 0 ? `Recent meals to avoid: ${mealHistory.slice(0, 20).join(", ")}` : ""}
${preferenceLines.length > 0 ? `\n${preferenceLines.join("\n")}` : ""}

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

// ── POST /ai/shopping-list ───────────────────────────────────────────────────
// Takes the current week's meal plan and returns a deduplicated, categorized ingredient list
router.post("/ai/shopping-list", async (req, res) => {
  // Require authenticated user — prevents unauthenticated OpenAI cost abuse
  if (!req.auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { meals } = req.body as {
      meals: Array<{ dayName: string; mealType: string; meal: string }>;
    };

    // Validate input bounds: at most 21 meals (3/day × 7 days), strings ≤ 200 chars
    if (!Array.isArray(meals) || meals.length === 0) {
      res.status(400).json({ error: "meals must be a non-empty array" });
      return;
    }
    if (meals.length > 21) {
      res.status(400).json({ error: "meals must contain at most 21 entries" });
      return;
    }
    for (const m of meals) {
      if (
        typeof m.dayName !== "string" || m.dayName.length > 200 ||
        typeof m.mealType !== "string" || m.mealType.length > 200 ||
        typeof m.meal !== "string" || m.meal.length > 200
      ) {
        res.status(400).json({ error: "Invalid meal entry" });
        return;
      }
    }

    const mealLines = meals
      .map((m) => `- ${m.dayName} ${m.mealType}: ${m.meal}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are a helpful family grocery assistant. Given the following weekly meal plan, generate a complete shopping list of ingredients needed.

Meal plan:
${mealLines}

Rules:
- Deduplicate ingredients (e.g. if chicken appears in multiple meals, list it once with the combined quantity)
- Categorize every item into one of these exact category keys: ${VALID_CATEGORIES.join(", ")}
- Include realistic quantities (e.g. "2 lbs", "1 dozen", "1 bunch", "1 can")
- Only include ingredients that need to be purchased (skip pantry staples like salt, pepper, oil unless a specific quantity is needed)
- Be practical for a family of 5 (2 adults, kids aged 5, 8, 10)

Respond ONLY with valid JSON — no markdown, no extra text:
{
  "items": [
    { "name": "Chicken breast", "quantity": "3 lbs", "category": "meat" },
    { "name": "Broccoli", "quantity": "2 heads", "category": "produce" }
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

    const parsed = JSON.parse(jsonMatch[0]) as { items: Array<{ name: string; quantity: string; category: string }> };

    // Server-side deduplication: normalize names and remove duplicates deterministically
    const seen = new Set<string>();
    const items = (parsed.items ?? [])
      .filter((item) => {
        if (typeof item.name !== "string" || !item.name.trim()) return false;
        const key = item.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({
        name: item.name.trim(),
        quantity: typeof item.quantity === "string" && item.quantity.trim() ? item.quantity.trim() : null,
        category: VALID_CATEGORIES.includes(item.category) ? item.category : "other",
      }));

    res.json({ items });
  } catch (err) {
    console.error("Shopping list error:", err);
    res.status(500).json({ error: "Failed to generate shopping list" });
  }
});

// ── POST /ai/chat ─────────────────────────────────────────────────────────────
// Household assistant — multi-turn, vision-capable, memory-aware
router.post("/ai/chat", async (req, res) => {
  try {
    const { messages, images } = req.body as {
      messages: { role: "user" | "assistant"; content: string }[];
      images?: string[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages required" });
    }

    // Load stored memories and existing memory strings in parallel
    const [memoriesCtx, existingRows] = await Promise.all([
      getMemoriesContext(),
      db.select({ content: aiMemoriesTable.content }).from(aiMemoriesTable),
    ]);
    const existingMemories = existingRows.map(r => r.content);

    const SYSTEM = `You are HomeHub Assistant — a warm, knowledgeable household AI for AJ and Emily's family.

Family members:
- AJ (parent) and Emily (parent)
- Holden (age 10, boy)
- Brody (age 8, boy)
- Daphne (age 5, girl)
- Willa (dog)

Properties:
- Main House (primary residence, school year focus)
- Cabin (seasonal/vacation property, ongoing maintenance)

What you help with:
- Workout planning: they like 20–30 minute workouts, knees-over-toes (ATG/Ben Patrick) style. Analyze photos of their space.
- Meal planning & recipes: family-friendly, kids ages 5/8/10, practical, low food waste.
- Grocery & shopping: organized lists, pantry scanning.
- Household maintenance: seasonal checklists for both properties.
- Kids chores, schedules, organization, family planning.
${memoriesCtx}
Tone: Friendly, direct, practical. Use bullet points and short paragraphs. Be specific — never generic when you have context. If they share a photo, describe what you see and give concrete advice based on it.`;

    // Build messages with optional vision blocks on the last user message
    const builtMessages: any[] = messages.slice(-12).map((m, idx, arr) => {
      const isLast = idx === arr.length - 1;
      if (isLast && m.role === "user" && images && images.length > 0) {
        const imgBlocks = images.map(raw => ({
          type: "image_url" as const,
          image_url: {
            url: raw.startsWith("data:") ? raw : `data:${detectMimeType(raw)};base64,${raw}`,
            detail: "low" as const,
          },
        }));
        return { role: "user", content: [...imgBlocks, { type: "text", text: m.content }] };
      }
      return { role: m.role, content: m.content };
    });

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [{ role: "system", content: SYSTEM }, ...builtMessages],
    });

    const reply = response.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";

    // Fire-and-forget: extract and persist any new memories from this exchange
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    const memorized = lastUserMsg
      ? extractAndSaveMemories(lastUserMsg.content, reply, existingMemories)
      : Promise.resolve([]);

    // Return reply immediately; wait for memory extraction to complete
    const newMemories = await memorized;
    res.json({ reply, memorized: newMemories });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

// ── GET /ai/memories ──────────────────────────────────────────────────────────
router.get("/ai/memories", async (_req, res) => {
  try {
    const rows = await db.select().from(aiMemoriesTable).orderBy(aiMemoriesTable.createdAt);
    res.json({ memories: rows });
  } catch (err) {
    console.error("Get memories error:", err);
    res.status(500).json({ error: "Failed to load memories" });
  }
});

// ── DELETE /ai/memories/:id ───────────────────────────────────────────────────
router.delete("/ai/memories/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { eq } = await import("drizzle-orm");
    await db.delete(aiMemoriesTable).where(eq(aiMemoriesTable.id, Number(id)));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete memory error:", err);
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

export default router;
