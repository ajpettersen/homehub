import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  mealPlansTable,
  aiMemoriesTable,
  familyMembersTable,
  propertiesTable,
  mealRatingsTable,
  peopleTable,
  contractorsTable,
} from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  getPropertyAuthorizationScope,
  type PropertyAuthorizationScope,
} from "../lib/propertyAuthorization";
import type { Request, Response } from "express";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import type { LookupAddress } from "node:dns";
import {
  formatLiveSnapshot,
  getLiveHouseholdSnapshot,
} from "../lib/aiLiveContext";
import { isBlockedIPv4, isBlockedIPv6 } from "../lib/ipAddress";

// ── Authorization helper ──────────────────────────────────────────────────────

/**
 * Require an authenticated, approved profile with at least one authorized
 * property. Returns the resolved scope, or null after having written the
 * appropriate 401/403 response.
 */
async function requireAiScope(
  req: Request,
  res: Response,
): Promise<PropertyAuthorizationScope | null> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  // getPropertyAuthorizationScope only returns approved (family/cleaner) profiles.
  const scope = await getPropertyAuthorizationScope(userId);
  if (!scope || scope.propertyIds.length === 0) {
    res.status(403).json({ error: "No household property access" });
    return null;
  }
  return scope;
}

// ── Memory helpers ────────────────────────────────────────────────────────────

/** Load stored memories for one household and format as a prompt section. */
async function getMemoriesContext(householdId: number): Promise<string> {
  try {
    const rows = await db
      .select()
      .from(aiMemoriesTable)
      .where(eq(aiMemoriesTable.householdId, householdId))
      .orderBy(aiMemoriesTable.createdAt);
    if (rows.length === 0) return "";
    const lines = rows.map(r => `- ${r.content}`).join("\n");
    return `\nThings already known about this family (use these to personalize every response):\n${lines}\n`;
  } catch {
    return "";
  }
}

/** Include names and categories, but never private notes or contact details. */
async function getPeopleContext(propertyIds: number[]): Promise<string> {
  if (propertyIds.length === 0) return "";
  try {
    const [people, contractors] = await Promise.all([
      db.select().from(peopleTable).where(inArray(peopleTable.propertyId, propertyIds)),
      db.select().from(contractorsTable).where(inArray(contractorsTable.propertyId, propertyIds)),
    ]);
    const personLines = people.slice(0, 40).map((person) => {
      const groups = person.groups?.length ? ` — ${person.groups.join(", ")}` : "";
      return `- ${person.name}${groups}`;
    });
    const contractorLines = contractors.slice(0, 30).map((contractor) => {
      const preferred = contractor.preferred ? " [preferred]" : "";
      return `- ${contractor.name}: ${contractor.trade}${preferred}`;
    });
    if (!personLines.length && !contractorLines.length) return "";
    return `\nHousehold people and contractor memory (private notes and contact details are not included):\n${
      personLines.length ? `People:\n${personLines.join("\n")}\n` : ""
    }${contractorLines.length ? `Contractors:\n${contractorLines.join("\n")}\n` : ""}`;
  } catch {
    return "";
  }
}
/** Extract and persist new memory facts from a conversation exchange (fire-and-forget). */
function extractAndSaveMemories(
  householdId: number,
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
        await db.insert(aiMemoriesTable).values({ householdId, content, category: "general" });
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

// ── SSRF-hardened page fetching ────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1024 * 1024; // ~1MB
/** Throw if a single resolved address falls in a blocked range. */
function assertSafeAddress(address: string, family: number): void {
  if (family === 4) {
    if (isBlockedIPv4(address)) throw new Error("Blocked IPv4 destination");
  } else if (family === 6) {
    if (isBlockedIPv6(address)) throw new Error("Blocked IPv6 destination");
  } else {
    throw new Error("Unknown address family");
  }
}

/**
 * Resolve a hostname and ensure every resolved address is a safe public
 * destination. Returns the exact validated address records so the subsequent
 * connection can be pinned to them (defeating DNS-rebinding TOCTOU).
 */
async function assertSafeHost(hostname: string): Promise<LookupAddress[]> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Blocked host");
  }

  // If the host is a literal IP, validate directly and pin to it.
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    assertSafeAddress(host, 4);
    return [{ address: host, family: 4 }];
  }
  if (ipVersion === 6) {
    assertSafeAddress(host, 6);
    return [{ address: host, family: 6 }];
  }

  // Otherwise resolve via DNS and validate every returned address.
  const records = await dnsLookup(host, { all: true });
  if (records.length === 0) throw new Error("Could not resolve host");
  for (const { address, family } of records) {
    assertSafeAddress(address, family);
  }
  return records;
}

/** A validated redirect hop: the parsed URL plus the exact IPs it may connect to. */
interface FetchTarget {
  url: URL;
  addresses: LookupAddress[];
}

/** Validate a URL is a plain http(s) public destination with no credentials or non-default ports. */
async function validateFetchTarget(rawUrl: string): Promise<FetchTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credentials in URL are not allowed");
  }
  // Only allow default ports (empty, 80 for http, 443 for https).
  if (parsed.port !== "") {
    const isDefault =
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443");
    if (!isDefault) throw new Error("Non-default ports are not allowed");
  }
  const addresses = await assertSafeHost(parsed.hostname);
  return { url: parsed, addresses };
}

/** Outcome of a single request hop. */
type HopResult =
  | { kind: "redirect"; location: string }
  | { kind: "body"; body: string };

/**
 * Perform one HTTP(S) request hop with the connection pinned to the exact
 * addresses that were validated for this hop.
 *
 * The `lookup` callback below is the key SSRF defence: Node's http/https
 * would otherwise resolve the hostname again at connect time, which is a
 * different resolution than the one we validated. A malicious authoritative
 * DNS server can answer with a public IP during validation and a private/
 * internal IP a moment later at connect time (DNS rebinding — a TOCTOU gap).
 * By feeding the socket ONLY the already-validated LookupAddress records, the
 * connection can never reach an address we did not vet, while `servername`
 * (SNI) and `host` stay set to the real hostname so TLS certificate
 * validation and Host routing remain correct and strict.
 */
function requestHop(
  target: FetchTarget,
  signal: AbortSignal,
): Promise<HopResult> {
  return new Promise<HopResult>((resolve, reject) => {
    const { url, addresses } = target;
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    // Pinned resolver: hand back only the addresses we validated for this hop.
    // Never performs an independent DNS lookup.
    const pinnedLookup: http.RequestOptions["lookup"] = (
      _hostname,
      options,
      callback,
    ) => {
      const wantAll = typeof options === "object" && options?.all === true;
      const wantFamily =
        typeof options === "object" && options?.family ? options.family : 0;

      // Honour a requested family strictly: never substitute a different
      // family, but every candidate here is already a validated address.
      const usable = wantFamily
        ? addresses.filter((a) => a.family === wantFamily)
        : addresses;

      if (usable.length === 0) {
        callback(new Error("No pinned address available"), "", 0);
        return;
      }

      if (wantAll) {
        (callback as (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void)(
          null,
          usable.map((a) => ({ address: a.address, family: a.family })),
        );
      } else {
        callback(null, usable[0].address, usable[0].family);
      }
    };

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; HomeHub/1.0)",
          Host: url.host,
          Accept: "text/html,text/*;q=0.9",
        },
        signal,
        lookup: pinnedLookup,
        // Keep real hostname for SNI + certificate validation. No permissive
        // TLS options — the default (rejectUnauthorized: true) is retained.
        ...(isHttps ? { servername: url.hostname } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;

        // Manual redirect handling — do not follow; let the caller revalidate.
        if (status >= 300 && status < 400) {
          const location = res.headers.location;
          res.resume(); // drain & discard body
          if (!location) {
            reject(new Error("Redirect without location"));
            return;
          }
          resolve({ kind: "redirect", location });
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }

        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (!contentType.includes("text/html") && !contentType.startsWith("text/")) {
          res.resume();
          reject(new Error("Unsupported content type"));
          return;
        }

        const decoder = new TextDecoder("utf-8", { fatal: false });
        let total = 0;
        let out = "";
        let settled = false;

        res.on("data", (chunk: Buffer) => {
          if (settled) return;
          total += chunk.byteLength;
          if (total > MAX_BODY_BYTES) {
            const remaining = chunk.byteLength - (total - MAX_BODY_BYTES);
            out += decoder.decode(chunk.subarray(0, Math.max(0, remaining)));
            settled = true;
            res.destroy(); // stop downloading past the cap
            resolve({ kind: "body", body: out });
            return;
          }
          out += decoder.decode(chunk, { stream: true });
        });

        res.on("end", () => {
          if (settled) return;
          settled = true;
          out += decoder.decode();
          resolve({ kind: "body", body: out });
        });

        res.on("error", (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.end();
  });
}

/** Fetch and trim a webpage for AI consumption (max ~8 000 chars). SSRF-hardened. */
async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let target = await validateFetchTarget(url);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const result = await requestHop(target, controller.signal);

      if (result.kind === "redirect") {
        if (hop === MAX_REDIRECTS) throw new Error("Too many redirects");
        // Revalidate AND re-pin the redirect target for the next hop.
        target = await validateFetchTarget(new URL(result.location, target.url).toString());
        continue;
      }

      const text = result.body
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return text.slice(0, 8000);
    }

    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timeout);
  }
}

// ── POST /ai/scan-pantry ─────────────────────────────────────────────────────
// Accepts one or more base64 photos of fridge/pantry, returns ingredient list + meal suggestions
router.post("/ai/scan-pantry", async (req, res) => {
  try {
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const { imagesBase64 } = req.body as { imagesBase64: string[] };

    if (!Array.isArray(imagesBase64) || imagesBase64.length === 0) {
      res.status(400).json({ error: "imagesBase64 must be a non-empty array" });
      return;
    }

    const recentMeals = await db
      .select({ meal: mealPlansTable.meal })
      .from(mealPlansTable)
      .where(inArray(mealPlansTable.propertyId, scope.propertyIds))
      .orderBy(desc(mealPlansTable.createdAt))
      .limit(60);

    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))];
    const memoriesCtx = await getMemoriesContext(scope.householdId);

    const imageContent = imagesBase64.map((raw) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${detectMimeType(raw)};base64,${stripPrefix(raw)}`,
        detail: "low" as const,
      },
    }));

    const photoWord = imagesBase64.length === 1 ? "photo" : `${imagesBase64.length} photos`;

    const SYSTEM = `You are a family meal planner AI. Scan fridge/pantry photos and return a JSON object with: ingredients found and meal suggestions.
${memoriesCtx}
Recent meals to avoid repeating: ${mealHistory.slice(0, 20).join(", ") || "none"}

Respond ONLY with valid JSON:
{
  "ingredients": ["chicken breast", "pasta"],
  "mealSuggestions": [
    { "name": "Pasta Primavera", "description": "...", "usesIngredients": ["pasta"], "missingIngredients": ["cream"] }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: `Please analyze ${photoWord} of my fridge/pantry and suggest meals.` },
            ...imageContent,
          ] as any,
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
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const { meal, generateImage } = req.body as { meal: string; generateImage?: boolean };

    if (!meal || typeof meal !== "string") {
      res.status(400).json({ error: "meal is required" });
      return;
    }

    const memoriesCtx = await getMemoriesContext(scope.householdId);

    const recipeResp = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are a family meal planner.
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
// Returns Mon–Sun meal suggestions, informed by per-member ratings + stored memories
router.post("/ai/suggest-week", async (req, res) => {
  try {
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const [recentMeals, familyMembers, allMealPlans, memoriesCtx] = await Promise.all([
      db.select({ meal: mealPlansTable.meal }).from(mealPlansTable).where(inArray(mealPlansTable.propertyId, scope.propertyIds)).orderBy(desc(mealPlansTable.createdAt)).limit(60),
      db.select().from(familyMembersTable).where(eq(familyMembersTable.householdId, scope.householdId)),
      db.select({ id: mealPlansTable.id, meal: mealPlansTable.meal }).from(mealPlansTable).where(inArray(mealPlansTable.propertyId, scope.propertyIds)).limit(200),
      getMemoriesContext(scope.householdId),
    ]);

    // Load per-member ratings for all known meal plan entries
    const mealPlanIds = allMealPlans.map(m => m.id);
    const perMemberRatings = mealPlanIds.length > 0
      ? await db.select().from(mealRatingsTable).where(inArray(mealRatingsTable.mealPlanId, mealPlanIds))
      : [];

    // Build a map: mealPlanId → meal name, then memberId → mealName → ratings[]
    const mealPlanById = new Map(allMealPlans.map(m => [m.id, m.meal]));
    const memberMealRatings = new Map<number, Map<string, string[]>>();

    for (const r of perMemberRatings) {
      const mealName = mealPlanById.get(r.mealPlanId);
      if (!mealName) continue;
      if (!memberMealRatings.has(r.memberId)) memberMealRatings.set(r.memberId, new Map());
      const mealMap = memberMealRatings.get(r.memberId)!;
      if (!mealMap.has(mealName)) mealMap.set(mealName, []);
      mealMap.get(mealName)!.push(r.rating);
    }

    // Build per-member preference summary lines for the AI prompt
    const memberPreferenceLines: string[] = [];
    for (const member of familyMembers) {
      const mealMap = memberMealRatings.get(member.id);
      if (!mealMap) continue;
      const loves: string[] = [];
      const skips: string[] = [];
      for (const [meal, ratings] of mealMap.entries()) {
        const loveCount = ratings.filter(r => r === "love").length;
        const skipCount = ratings.filter(r => r === "skip").length;
        if (loveCount > 0 && loveCount >= skipCount) loves.push(meal);
        if (skipCount > 0 && skipCount > loveCount) skips.push(meal);
      }
      const parts: string[] = [];
      if (loves.length > 0) parts.push(`loves: ${loves.slice(0, 8).join(", ")}`);
      if (skips.length > 0) parts.push(`refuses/skips: ${skips.slice(0, 8).join(", ")}`);
      if (parts.length > 0) {
        memberPreferenceLines.push(`  - ${member.name}: ${parts.join("; ")}`);
      }
    }

    const mealHistory = [...new Set(recentMeals.map((m) => m.meal))];

    const SYSTEM = `You are a family meal planner. Suggest a full week of meals (breakfast, lunch, dinner for Mon–Sun) for a family with kids.

Recent meals already eaten (vary from these): ${mealHistory.slice(0, 25).join(", ") || "none"}

Per-member food preferences:
${memberPreferenceLines.length > 0 ? memberPreferenceLines.join("\n") : "  - (no per-member ratings yet — use general family-friendly meals)"}

${memoriesCtx}
Rules:
- Avoid meals marked as "refuses/skips" by any member whenever possible
- Prioritize meals loved by most members
- Keep meals practical and kid-friendly
- Vary cuisines and protein types across the week

Respond ONLY with valid JSON:
{
  "days": [
    {
      "dayName": "Monday",
      "breakfast": "Scrambled Eggs & Toast",
      "lunch": "PB&J Sandwiches",
      "dinner": "Spaghetti Bolognese"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "Please suggest a full week of meals for our family." },
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
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const { url } = req.body as { url: string };
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }

    let pageText: string;
    try {
      pageText = await fetchPageText(url);
    } catch {
      res.status(422).json({ error: "Could not fetch that URL. Make sure it's a public recipe page." });
      return;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Extract the recipe name from this webpage text. Respond ONLY with valid JSON: {"name": "Recipe Name Here"}. If it's not a recipe page, respond: {"error": "Not a recipe page"}\n\nPage text:\n${pageText.slice(0, 4000)}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { name?: string; error?: string };
    if (parsed.error) {
      res.status(422).json({ error: parsed.error });
      return;
    }

    res.json(parsed);
  } catch (err) {
    console.error("Extract recipe URL error:", err);
    res.status(500).json({ error: "Failed to extract recipe" });
  }
});

// ── POST /ai/shopping-list ────────────────────────────────────────────────────
// Takes the current week's meal plan and returns a deduplicated, categorized ingredient list
router.post("/ai/shopping-list", async (req, res) => {
  try {
    // Require authentication + household access — this calls OpenAI and must not be public
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const { meals } = req.body as {
      meals: Array<{ dayName: string; mealType: string; meal: string }>;
    };

    if (!Array.isArray(meals) || meals.length === 0) {
      res.status(400).json({ error: "meals must be a non-empty array" });
      return;
    }
    // Cap input size: max 21 meals (7 days × 3 types), each meal name max 100 chars
    const MAX_MEALS = 21;
    const MAX_MEAL_NAME_LEN = 100;
    if (meals.length > MAX_MEALS) {
      res.status(400).json({ error: `Too many meals — maximum ${MAX_MEALS}` });
      return;
    }

    const mealLines = meals
      .map((m) => `- ${m.dayName} ${m.mealType}: ${String(m.meal ?? "").slice(0, MAX_MEAL_NAME_LEN)}`)
      .join("\n");

    const shoppingResponse = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a helpful family grocery assistant. Given the following weekly meal plan, generate a complete shopping list.

Meal plan:
${mealLines}

Rules:
- Deduplicate ingredients (e.g. if chicken appears in multiple meals, list it once with combined quantity)
- Categorize every item into one of these exact category keys: ${VALID_CATEGORIES.join(", ")}
- Include realistic quantities (e.g. "2 lbs", "1 dozen", "1 bunch", "1 can")
- Skip pantry staples like salt, pepper, oil unless a specific quantity is needed
- Be practical for a family with adults and kids

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

    const shoppingContent = shoppingResponse.choices[0]?.message?.content ?? "";
    const jsonMatch = shoppingContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { items: Array<{ name: string; quantity: string; category: string }> };

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
// Household assistant — multi-turn, vision-capable, memory-aware, live family context
router.post("/ai/chat", async (req, res) => {
  try {
    const { messages, images } = req.body as {
      messages: { role: "user" | "assistant"; content: string }[];
      images?: string[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages required" });
      return;
    }

    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const MAX_MESSAGES = 12;
    const MAX_MSG_LEN = 2000;
    const MAX_IMAGES = 4;
    const snapshotNow = new Date();

    // Load live household context + memories in parallel (scoped to this household)
    const [members, properties, memoriesCtx, peopleCtx, existingRows, liveSnapshot] = await Promise.all([
      db.select().from(familyMembersTable).where(eq(familyMembersTable.householdId, scope.householdId)),
      db.select().from(propertiesTable).where(inArray(propertiesTable.id, scope.propertyIds)),
      getMemoriesContext(scope.householdId),
      getPeopleContext(scope.propertyIds),
      db.select({ content: aiMemoriesTable.content }).from(aiMemoriesTable).where(eq(aiMemoriesTable.householdId, scope.householdId)),
      getLiveHouseholdSnapshot(scope.propertyIds, snapshotNow),
    ]);

    const existingMemories = existingRows.map(r => r.content);
    const memberLines = members.length > 0
      ? members.map(m => `- ${m.name} (${m.role ?? "member"})`).join("\n")
      : "- (no family members recorded yet)";
    const propertyLines = properties.length > 0
      ? properties.map(p => `- ${p.name}${p.address ? ` — ${p.address}` : ""}`).join("\n")
      : "- (no properties recorded yet)";

    const SYSTEM = `You are HomeHub Assistant — a warm, knowledgeable household AI for this family.

Family members:
${memberLines}

Properties:
${propertyLines}

${formatLiveSnapshot(liveSnapshot, snapshotNow)}

What you help with:
- Workout planning: they like 20–30 minute workouts, knees-over-toes (ATG/Ben Patrick) style. Analyze photos of their space.
- Meal planning & recipes: family-friendly, practical, low food waste.
- Grocery & shopping: organized lists, pantry scanning.
- Household maintenance: seasonal checklists for both properties.
- Kids chores, schedules, organization, family planning.
- Household relationships and trusted contractors: use the people and contractor memory when relevant. Do not invent or expose contact details.
${memoriesCtx}
${peopleCtx}
Tone: Friendly, direct, practical. Use bullet points and short paragraphs. Be specific — never generic when you have context. If they share a photo, describe what you see and give concrete advice based on it.`;

    const trimmedMessages = messages.slice(-MAX_MESSAGES).map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content.slice(0, MAX_MSG_LEN) : "",
    }));

    const trimmedImages = (images ?? []).slice(0, MAX_IMAGES);

    // Build messages with optional vision blocks on the last user message
    const builtMessages: any[] = trimmedMessages.map((m, idx, arr) => {
      const isLast = idx === arr.length - 1;
      if (isLast && m.role === "user" && trimmedImages.length > 0) {
        const imgBlocks = trimmedImages.map(raw => ({
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

    const chatResponse = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [{ role: "system", content: SYSTEM }, ...builtMessages],
    });

    const reply = chatResponse.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";

    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    const newMemories = lastUserMsg
      ? await extractAndSaveMemories(scope.householdId, lastUserMsg.content, reply, existingMemories)
      : [];

    res.json({ reply, memorized: newMemories });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

// ── GET /ai/memories ──────────────────────────────────────────────────────────
router.get("/ai/memories", async (req, res) => {
  try {
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const rows = await db
      .select({
        id: aiMemoriesTable.id,
        content: aiMemoriesTable.content,
        category: aiMemoriesTable.category,
        createdAt: aiMemoriesTable.createdAt,
      })
      .from(aiMemoriesTable)
      .where(eq(aiMemoriesTable.householdId, scope.householdId))
      .orderBy(aiMemoriesTable.createdAt);
    res.json({ memories: rows });
  } catch (err) {
    console.error("Get memories error:", err);
    res.status(500).json({ error: "Failed to load memories" });
  }
});

// ── DELETE /ai/memories/:id ───────────────────────────────────────────────────
router.delete("/ai/memories/:id", async (req, res) => {
  try {
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid memory id" });
      return;
    }

    const deleted = await db
      .delete(aiMemoriesTable)
      .where(and(
        eq(aiMemoriesTable.id, id),
        eq(aiMemoriesTable.householdId, scope.householdId),
      ))
      .returning({ id: aiMemoriesTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Delete memory error:", err);
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

export default router;
