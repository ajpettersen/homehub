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
  groceryListsTable,
  groceryItemsTable,
  maintenanceTasksTable,
  choresTable,
  chatMessagesTable,
} from "@workspace/db/schema";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
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
export function visibleMemoryWhere(householdId: number, actorMemberId: number | null) {
  return and(
    eq(aiMemoriesTable.householdId, householdId),
    actorMemberId
      ? or(
          isNull(aiMemoriesTable.subjectFamilyMemberId),
          eq(aiMemoriesTable.subjectFamilyMemberId, actorMemberId),
        )
      : isNull(aiMemoriesTable.subjectFamilyMemberId),
  );
}

export function deletableMemoryWhere(householdId: number, actorMemberId: number, memoryId: number) {
  return and(
    eq(aiMemoriesTable.id, memoryId),
    eq(aiMemoriesTable.householdId, householdId),
    or(
      isNull(aiMemoriesTable.subjectFamilyMemberId),
      eq(aiMemoriesTable.subjectFamilyMemberId, actorMemberId),
    ),
  );
}

async function getMemoriesContext(householdId: number, actorMemberId: number | null): Promise<string> {
  try {
    const rows = await db
      .select()
      .from(aiMemoriesTable)
      .where(visibleMemoryWhere(householdId, actorMemberId))
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
  subjectFamilyMemberId: number | null,
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

      const savedFacts: string[] = [];
      for (const content of newFacts) {
        const normalized = content.trim().replace(/\s+/g, " ").toLowerCase();
        const alreadyStored = existingMemories.some(
          memory => memory.trim().replace(/\s+/g, " ").toLowerCase() === normalized,
        );
        if (alreadyStored) continue;

        if (!subjectFamilyMemberId) continue;
        await db.insert(aiMemoriesTable).values({
          householdId,
          subjectFamilyMemberId,
          content,
          category: "general",
          source: "chat",
        });
        existingMemories.push(content);
        savedFacts.push(content);
      }
      return savedFacts;
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

const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const VALID_MAINTENANCE_CATEGORIES = ["filter", "water", "seasonal", "appliance", "yard", "other", "cleaning"] as const;
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

type MaintenanceRecommendation = {
  title: string;
  description: string | null;
  category: typeof VALID_MAINTENANCE_CATEGORIES[number];
  reason: string;
  defaultFrequencyDays: number;
};

function parseMaintenanceRecommendations(content: string): MaintenanceRecommendation[] {
  let parsed: { recommendations?: unknown };
  try {
    parsed = JSON.parse(content) as { recommendations?: unknown };
  } catch {
    throw new Error("AI response was not valid structured JSON");
  }
  if (!Array.isArray(parsed.recommendations)) {
    throw new Error("AI response did not contain recommendations");
  }
  if (parsed.recommendations.length > 10) {
    throw new Error("AI response exceeded the recommendation limit");
  }

  const seen = new Set<string>();
  const recommendations: MaintenanceRecommendation[] = [];
  for (const raw of parsed.recommendations) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("AI response contained an invalid recommendation");
    }
    const item = raw as Record<string, unknown>;
    const validKeys = new Set(["title", "description", "category", "reason", "defaultFrequencyDays"]);
    if (Object.keys(item).some(key => !validKeys.has(key))) {
      throw new Error("AI response contained unexpected recommendation fields");
    }
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    const category = item.category;
    const frequency = item.defaultFrequencyDays;
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (
      !title || title.length > 120 || !reason || reason.length > 500 ||
      !VALID_MAINTENANCE_CATEGORIES.includes(category as typeof VALID_MAINTENANCE_CATEGORIES[number]) ||
      typeof frequency !== "number" || !Number.isFinite(frequency) || !Number.isInteger(frequency) ||
      frequency < 1 || frequency > 3650 ||
      !normalizedTitle
    ) throw new Error("AI response contained an invalid recommendation");
    if (seen.has(normalizedTitle)) continue;
    seen.add(normalizedTitle);
    if (item.description !== null && (typeof item.description !== "string" || item.description.length > 500)) {
      throw new Error("AI response contained an invalid description");
    }
    const description = typeof item.description === "string" ? item.description.trim() : null;
    recommendations.push({
      title,
      description,
      category: category as MaintenanceRecommendation["category"],
      reason,
      defaultFrequencyDays: frequency,
    });
  }
  return recommendations;
}

// ── POST /ai/recommend-maintenance ────────────────────────────────────────────
// This endpoint only recommends tasks. The caller explicitly chooses which
// recommendations to create through the maintenance task endpoint.
router.post("/ai/recommend-maintenance", async (req, res) => {
  try {
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    const propertyId = Number(req.body?.propertyId);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      res.status(400).json({ error: "Invalid propertyId" });
      return;
    }
    if (!scope.propertyIds.includes(propertyId)) {
      res.status(403).json({ error: "Unauthorized property" });
      return;
    }

    const [[property], existingTasks] = await Promise.all([
      db.select().from(propertiesTable).where(and(
        eq(propertiesTable.id, propertyId),
        eq(propertiesTable.householdId, scope.householdId),
      )).limit(1),
      db.select({
        title: maintenanceTasksTable.title,
        description: maintenanceTasksTable.description,
        category: maintenanceTasksTable.category,
      }).from(maintenanceTasksTable).where(eq(maintenanceTasksTable.propertyId, propertyId)),
    ]);
    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    const existing = existingTasks.length
      ? existingTasks.map(task => `- ${task.title}${task.description ? `: ${task.description}` : ""}`).join("\n")
      : "None";
    const existingTitles = new Set(existingTasks.map(task => task.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "maintenance_recommendations",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["recommendations"],
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "description", "category", "reason", "defaultFrequencyDays"],
                  properties: {
                    title: { type: "string" },
                    description: { type: ["string", "null"] },
                    category: { type: "string", enum: [...VALID_MAINTENANCE_CATEGORIES] },
                    reason: { type: "string" },
                    defaultFrequencyDays: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You are a practical property maintenance planner. Return 4–10 useful recurring maintenance ideas tailored to the property's type and details. Exclude anything already covered by an existing task, including synonymous or meaning-equivalent tasks. Avoid cosmetic projects and vague advice. Frequencies must be positive whole days between 1 and 3650 and realistic for the work.

Use only these category values: ${VALID_MAINTENANCE_CATEGORIES.join(", ")}.
Respond ONLY as valid JSON:
{"recommendations":[{"title":"Concise task title","description":"Optional actionable detail","category":"filter","reason":"Why this matters for this property","defaultFrequencyDays":90}]}`,
        },
        {
          role: "user",
          content: `Property name: ${property.name}
Property type: ${property.type}
${property.address ? `Property address: ${property.address}` : "Property address: not provided"}

Existing maintenance tasks to exclude:
${existing}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI response was empty");
    const recommendations = parseMaintenanceRecommendations(content).filter(
      recommendation => !existingTitles.has(recommendation.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()),
    );
    res.json({ recommendations });
  } catch (err) {
    console.error("Maintenance recommendation error:", err);
    res.status(500).json({ error: "Failed to recommend maintenance" });
  }
});

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
    const memoriesCtx = await getMemoriesContext(scope.householdId, scope.linkedFamilyMemberId);

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

    const memoriesCtx = await getMemoriesContext(scope.householdId, scope.linkedFamilyMemberId);

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
      getMemoriesContext(scope.householdId, scope.linkedFamilyMemberId),
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

    const SYSTEM = `You are a practical family meal planner.
${memoriesCtx}

Recent meals to avoid repeating: ${mealHistory.slice(0, 30).join(", ") || "none"}
Family meal preferences from past ratings:
${memberPreferenceLines.join("\n") || "  - No ratings yet"}

Create a varied, family-friendly week with simple breakfasts, lunches, and dinners.
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

    const [members, properties, memoriesCtx, peopleCtx, existingRows, liveSnapshot, groceryLists] = await Promise.all([
      db.select().from(familyMembersTable).where(eq(familyMembersTable.householdId, scope.householdId)),
      db.select().from(propertiesTable).where(inArray(propertiesTable.id, scope.propertyIds)),
      getMemoriesContext(scope.householdId, scope.linkedFamilyMemberId),
      getPeopleContext(scope.propertyIds),
      db.select({ content: aiMemoriesTable.content }).from(aiMemoriesTable)
        .where(visibleMemoryWhere(scope.householdId, scope.linkedFamilyMemberId)),
      getLiveHouseholdSnapshot(scope.propertyIds, snapshotNow),
      db
        .select({
          id: groceryListsTable.id,
          name: groceryListsTable.name,
          propertyId: groceryListsTable.propertyId,
        })
        .from(groceryListsTable)
        .where(inArray(groceryListsTable.propertyId, scope.propertyIds)),
    ]);
    const existingMemories = existingRows.map(r => r.content);
    const memberLines = members.length > 0
      ? members.map(m => `- ${m.name} (${m.role ?? "member"}; id: ${m.id})`).join("\n")
      : "- (no family members recorded yet)";
    const propertyLines = properties.length > 0
      ? properties.map(p => `- ${p.name} (${p.type}; id: ${p.id})${p.address ? ` — ${p.address}` : ""}`).join("\n")
      : "- (no properties recorded yet)";

    const groceryListLines = groceryLists.length > 0
      ? groceryLists.map(list => `- ${list.name} (id: ${list.id}; property id: ${list.propertyId})`).join("\n")
      : "- (no shopping list exists yet)";
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
Shopping lists:
${groceryListLines}

You can take household actions with the available tools:
- Use a tool only when the user explicitly asks you to add, create, or schedule something.
- Never claim an action was completed unless its tool result says it succeeded. After every successful action, clearly confirm what you did.
- Use the supplied property, family member, and shopping-list IDs exactly. Do not invent IDs.
- When the household has a House/Home property and the user does not name a property, use that for meals and chores; otherwise ask a clarification instead of guessing.
- A single reminder is a one-time maintenance task. Use recurring only when the user asks for a repeated task.
- For dates such as "Thursday" or "in 3 months", calculate an exact YYYY-MM-DD date using today: ${snapshotNow.toISOString().slice(0, 10)}.

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

    const toolContext: AiActionContext = {
      scope,
      propertyIds: scope.propertyIds,
      members: members.map(({ id, name }) => ({ id, name })),
      groceryLists,
      now: snapshotNow,
    };
    const conversation: any[] = [{ role: "system", content: SYSTEM }, ...builtMessages];
    const completedActions = new Set<string>();
    const confirmations: string[] = [];
    const failures: string[] = [];
    let assistantMessage: any;
    let reply = "";

    for (let round = 0; round < 4; round += 1) {
      const chatResponse = await openai.chat.completions.create({
        model: "gpt-5.6-luna",
        max_completion_tokens: 1024,
        messages: conversation,
        tools: AI_ACTION_TOOLS as any,
        tool_choice: "auto",
      });

      assistantMessage = chatResponse.choices[0]?.message;
      if (!assistantMessage) break;

      const toolCalls = (assistantMessage.tool_calls ?? []) as any[];
      if (toolCalls.length === 0) {
        reply = assistantMessage.content ?? "";
        break;
      }

      conversation.push(assistantMessage);
      for (const toolCall of toolCalls) {
        const toolName = toolCall.type === "function" ? toolCall.function.name : "";
        let result: AiActionResult;
        try {
          const args = toolCall.type === "function"
            ? JSON.parse(toolCall.function.arguments || "{}")
            : {};
          const fingerprint = actionFingerprint(toolName, args);
          if (completedActions.has(fingerprint)) {
            result = { ok: true, confirmation: "That action was already completed." };
          } else {
            result = await executeAiAction(toolName, args, toolContext);
            if (result.ok) completedActions.add(fingerprint);
          }
        } catch (error) {
          result = {
            ok: false,
            error: error instanceof Error ? error.message : "The action could not be completed",
          };
        }

        if (result.ok && result.confirmation) confirmations.push(result.confirmation);
        if (!result.ok) failures.push(result.error ?? "The action could not be completed");
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!reply) {
      const outcomes = [...confirmations, ...failures].join("\n");
      reply = outcomes || assistantMessage?.content || "Sorry, I couldn't generate a response.";
    }

    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    const newMemories = lastUserMsg
      ? await extractAndSaveMemories(
          scope.householdId,
          scope.linkedFamilyMemberId,
          lastUserMsg.content,
          reply,
          existingMemories,
        )
      : [];

    if (lastUserMsg) {
      await db.insert(chatMessagesTable).values([
        {
          householdId: scope.householdId,
          role: "user",
          content: typeof lastUserMsg.content === "string" ? lastUserMsg.content.slice(0, MAX_MSG_LEN) : "",
        },
        {
          householdId: scope.householdId,
          role: "assistant",
          content: reply.slice(0, MAX_MSG_LEN),
        },
      ]);
    }

    res.json({ reply, memorized: newMemories });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

// ── GET /ai/chat/history ──────────────────────────────────────────────────────
router.get("/ai/chat/history", async (req, res) => {
  try {
    const scope = await requireAiScope(req, res);
    if (!scope) return;
    const rows = await db
      .select({
        role: chatMessagesTable.role,
        content: chatMessagesTable.content,
      })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.householdId, scope.householdId))
      .orderBy(desc(chatMessagesTable.createdAt), desc(chatMessagesTable.id))
      .limit(20);

    res.json({ messages: rows.reverse() });
  } catch (err) {
    console.error("Get chat history error:", err);
    res.status(500).json({ error: "Failed to load chat history" });
  }
});

// ── DELETE /ai/chat/history ───────────────────────────────────────────────────
router.delete("/ai/chat/history", async (req, res) => {
  try {
    const scope = await requireAiScope(req, res);
    if (!scope) return;

    await db
      .delete(chatMessagesTable)
      .where(eq(chatMessagesTable.householdId, scope.householdId));

    res.json({ ok: true });
  } catch (err) {
    console.error("Clear chat history error:", err);
    res.status(500).json({ error: "Failed to clear chat history" });
  }
});

// ── GET /ai/memories ──────────────────────────────────────────────────────────
router.get("/ai/memories", async (req, res) => {
  try {
    const scope = await requireAiScope(req, res);
    if (!scope) return;
    if (scope.role !== "family" || !scope.linkedFamilyMemberId) {
      res.status(403).json({ error: "An approved linked adult account is required" });
      return;
    }

    const rows = await db
      .select({
        id: aiMemoriesTable.id,
        content: aiMemoriesTable.content,
        category: aiMemoriesTable.category,
        source: aiMemoriesTable.source,
        subjectFamilyMemberId: aiMemoriesTable.subjectFamilyMemberId,
        createdAt: aiMemoriesTable.createdAt,
      })
      .from(aiMemoriesTable)
      .where(visibleMemoryWhere(scope.householdId, scope.linkedFamilyMemberId))
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
    if (scope.role !== "family" || !scope.linkedFamilyMemberId) {
      res.status(403).json({ error: "An approved linked adult account is required" });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid memory id" });
      return;
    }

    const deleted = await db
      .delete(aiMemoriesTable)
      .where(deletableMemoryWhere(scope.householdId, scope.linkedFamilyMemberId, id))
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

const VALID_CHORE_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "custom"] as const;

function mondayForDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() - (day === 0 ? 6 : day - 1));
  return parsed.toISOString().slice(0, 10);
}

const OPTIONAL_ACTION_FIELDS: Record<string, string[]> = {
  add_meal_plan_entry: ["notes"],
  add_grocery_item: ["quantity", "listId", "listName", "propertyId"],
  create_maintenance_task: ["description", "frequencyDays"],
  add_chore: ["dueDate", "assigneeId", "points"],
};

function cleanActionString(value: unknown, field: string, maxLength = 300): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(`${field} is too long`);
  return cleaned;
}

function optionalActionString(value: unknown, maxLength = 500): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Expected a string");
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error("Text value is too long");
  return cleaned || null;
}

type AiActionResult = {
  ok: boolean;
  confirmation?: string;
  error?: string;
};

const AI_ACTION_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "add_meal_plan_entry",
      description: "Add one meal to a specific calendar date and meal slot. Only call this when the user explicitly asks to add or plan a meal.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          meal: { type: "string", description: "The meal name, for example tacos" },
          date: { type: "string", description: "Calendar date in YYYY-MM-DD format. Resolve relative dates using today's date from the system prompt." },
          mealType: { type: "string", enum: VALID_MEAL_TYPES, description: "The meal slot" },
          propertyId: { type: "integer", description: "ID of the property for this meal" },
          notes: { type: ["string", "null"], description: "Optional notes for the meal" },
        },
        required: ["meal", "date", "mealType", "propertyId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_grocery_item",
      description: "Add one item to the household shopping list. Only call this when the user explicitly asks to add groceries or shopping items.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Item name" },
          quantity: { type: ["string", "null"], description: "Optional amount, such as 2 cartons" },
          category: { type: "string", enum: VALID_CATEGORIES, description: "Grocery category" },
          listId: { type: ["integer", "null"], description: "Existing shopping list ID from the household context, when known" },
          listName: { type: ["string", "null"], description: "Shopping list name, when the user specified one" },
          propertyId: { type: ["integer", "null"], description: "Property ID when a new list must be created" },
        },
        required: ["name", "quantity", "category"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_maintenance_task",
      description: "Create a household maintenance reminder. Use one-time for a single reminder such as 'in 3 months'; use recurring only when the user asks for repetition.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Short task title" },
          description: { type: ["string", "null"], description: "Optional task details" },
          propertyId: { type: "integer", description: "ID of the property for this task" },
          category: { type: "string", enum: VALID_MAINTENANCE_CATEGORIES },
          scheduleType: { type: "string", enum: ["one-time", "recurring"] },
          dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" },
          frequencyDays: { type: ["integer", "null"], description: "Positive repeat interval in days for recurring tasks" },
        },
        required: ["title", "propertyId", "category", "scheduleType", "dueDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_chore",
      description: "Add a chore for the household. Only call this when the user explicitly asks to create or add a chore.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Chore title" },
          propertyId: { type: "integer", description: "ID of the property for this chore" },
          frequency: { type: "string", enum: VALID_CHORE_FREQUENCIES },
          dueDate: { type: ["string", "null"], description: "Optional due date in YYYY-MM-DD format" },
          assigneeId: { type: ["integer", "null"], description: "Optional family member ID from the household context" },
          points: { type: ["integer", "null"], description: "Optional reward points, defaults to 10" },
        },
        required: ["title", "propertyId", "frequency"],
      },
    },
  },
] as const;

function nextRecurringDueDate(startDate: string, frequencyDays: number, now: Date): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  if (start >= today) return startDate;

  const elapsedDays = Math.ceil((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const repeats = Math.ceil(elapsedDays / frequencyDays);
  start.setUTCDate(start.getUTCDate() + repeats * frequencyDays);
  return start.toISOString().slice(0, 10);
}

function actionFingerprint(name: string, rawArgs: unknown): string {
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(args), ...(OPTIONAL_ACTION_FIELDS[name] ?? [])]);

  for (const key of [...keys].sort()) {
    const value = args[key];
    if (value === undefined || value === null || value === "") {
      normalized[key] = null;
    } else if (NUMERIC_ACTION_FIELDS.has(key)) {
      normalized[key] = Number(value);
    } else if (typeof value === "string") {
      normalized[key] = value.trim();
    } else {
      normalized[key] = value;
    }
  }
  return `${name}:${JSON.stringify(normalized)}`;
}

/** Parse a strict calendar date and reject values JavaScript would normalize. */
function parseActionDate(value: unknown, field: string): string {
  const date = cleanActionString(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${field} must be YYYY-MM-DD`);
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a valid date`);
  }
  return date;
}

function resolveGroceryList(
  args: Record<string, unknown>,
  context: AiActionContext,
): { id: number; name: string; propertyId: number } | null {
  const rawListId = args.listId;
  if (rawListId !== undefined && rawListId !== null) {
    const listId = Number(rawListId);
    if (!Number.isInteger(listId)) throw new Error("Invalid shopping list");
    const list = context.groceryLists.find((candidate) => candidate.id === listId);
    if (!list) throw new Error("That shopping list is not available to this household");
    return list;
  }

  const listName = optionalActionString(args.listName, 100)?.toLowerCase();
  if (listName) {
    const list = context.groceryLists.find((candidate) => candidate.name.toLowerCase() === listName);
    if (!list) throw new Error(`No shopping list named "${args.listName}" was found`);
    return list;
  }

  if (context.groceryLists.length === 1) return context.groceryLists[0];
  const preferred = context.groceryLists.find((list) => /^(groceries|shopping|shopping list)$/i.test(list.name));
  if (preferred) return preferred;
  if (context.groceryLists.length > 1) {
    throw new Error("There is more than one shopping list; ask which list to use");
  }
  return null;
}

function authorizedPropertyId(value: unknown, propertyIds: number[]): number {
  const propertyId = Number(value);
  if (!Number.isInteger(propertyId) || !propertyIds.includes(propertyId)) {
    throw new Error("That property is not available to this household");
  }
  return propertyId;
}

async function executeAiAction(
  name: string,
  rawArgs: unknown,
  context: AiActionContext,
): Promise<AiActionResult> {
  try {
    const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;

    if (name === "add_meal_plan_entry") {
      const meal = cleanActionString(args.meal, "meal");
      const date = parseActionDate(args.date, "date");
      const mealType = cleanActionString(args.mealType, "mealType", 20);
      if (!(VALID_MEAL_TYPES as readonly string[]).includes(mealType)) throw new Error("Invalid meal type");
      const propertyId = authorizedPropertyId(args.propertyId, context.propertyIds);
      const notes = optionalActionString(args.notes);
      await db.insert(mealPlansTable).values({
        weekStart: mondayForDate(date),
        dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
        mealType,
        meal,
        notes,
        propertyId,
      });
      return { ok: true, confirmation: `Done — I added ${meal} to ${date}'s ${mealType} slot.` };
    }

    if (name === "add_grocery_item") {
      const itemName = cleanActionString(args.name, "name", 200);
      const category = cleanActionString(args.category, "category", 30);
      if (!(VALID_CATEGORIES as readonly string[]).includes(category)) throw new Error("Invalid grocery category");
      const quantity = optionalActionString(args.quantity, 100);
      let list = resolveGroceryList(args, context);
      if (!list) {
        const propertyId = authorizedPropertyId(
          args.propertyId ?? (context.propertyIds.length === 1 ? context.propertyIds[0] : undefined),
          context.propertyIds,
        );
        const [createdList] = await db
          .insert(groceryListsTable)
          .values({ name: "Shopping List", propertyId })
          .returning({ id: groceryListsTable.id, name: groceryListsTable.name, propertyId: groceryListsTable.propertyId });
        list = createdList;
        context.groceryLists.push(createdList);
      }
      await db.insert(groceryItemsTable).values({
        listId: list.id,
        name: itemName,
        quantity,
        category,
        addedBy: "HomeHub Assistant",
      });
      return { ok: true, confirmation: `Done — I added ${itemName}${quantity ? ` (${quantity})` : ""} to ${list.name}.` };
    }

    if (name === "create_maintenance_task") {
      const title = cleanActionString(args.title, "title");
      const description = optionalActionString(args.description);
      const propertyId = authorizedPropertyId(args.propertyId, context.propertyIds);
      const category = cleanActionString(args.category, "category", 30);
      if (!(VALID_MAINTENANCE_CATEGORIES as readonly string[]).includes(category)) throw new Error("Invalid maintenance category");
      const scheduleType = cleanActionString(args.scheduleType, "scheduleType", 20);
      if (scheduleType !== "one-time" && scheduleType !== "recurring") throw new Error("Invalid maintenance schedule");
      const dueDate = parseActionDate(args.dueDate, "dueDate");
      const frequencyDays = args.frequencyDays === undefined || args.frequencyDays === null
        ? null
        : Number(args.frequencyDays);
      if (scheduleType === "recurring" && (!Number.isInteger(frequencyDays) || (frequencyDays ?? 0) < 1)) {
        throw new Error("Recurring maintenance needs a positive frequencyDays");
      }
      const nextDueDate = scheduleType === "recurring"
        ? nextRecurringDueDate(dueDate, frequencyDays!, context.now)
        : dueDate;
      await db.insert(maintenanceTasksTable).values({
        title,
        description,
        propertyId,
        category,
        assigneeId: null,
        frequencyDays: scheduleType === "recurring" ? frequencyDays : null,
        scheduleType,
        isCompleted: false,
        isCleanerTask: false,
        startDate: scheduleType === "recurring" ? dueDate : null,
        nextDueDate,
      });
      return { ok: true, confirmation: `Done — I created the ${scheduleType === "one-time" ? "reminder" : "recurring task"} “${title}” for ${nextDueDate}.` };
    }

    if (name === "add_chore") {
      const title = cleanActionString(args.title, "title");
      const propertyId = authorizedPropertyId(args.propertyId, context.propertyIds);
      const frequency = cleanActionString(args.frequency, "frequency", 20);
      if (!(VALID_CHORE_FREQUENCIES as readonly string[]).includes(frequency)) throw new Error("Invalid chore frequency");
      const dueDate = args.dueDate === undefined || args.dueDate === null ? null : parseActionDate(args.dueDate, "dueDate");
      const points = args.points === undefined || args.points === null ? 10 : Number(args.points);
      if (!Number.isInteger(points) || points < 0 || points > 1000) throw new Error("points must be a whole number from 0 to 1000");
      const assigneeId = args.assigneeId === undefined || args.assigneeId === null ? null : Number(args.assigneeId);
      let assigneeName: string | null = null;
      if (assigneeId !== null) {
        const assignee = context.members.find((member) => member.id === assigneeId);
        if (!assignee) throw new Error("That family member is not available to this household");
        assigneeName = assignee.name;
      }
      await db.insert(choresTable).values({
        title,
        assigneeId,
        propertyId,
        frequency,
        dueDate,
        points,
      });
      return {
        ok: true,
        confirmation: `Done — I added the chore “${title}”${assigneeName ? ` for ${assigneeName}` : ""}${dueDate ? `, due ${dueDate}` : ""}.`,
      };
    }

    return { ok: false, error: `Unknown assistant action: ${name}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The action could not be completed" };
  }
}

const NUMERIC_ACTION_FIELDS = new Set([
  "propertyId",
  "listId",
  "assigneeId",
  "points",
  "frequencyDays",
]);

type AiActionContext = {
  scope: PropertyAuthorizationScope;
  propertyIds: number[];
  members: { id: number; name: string }[];
  groceryLists: { id: number; name: string; propertyId: number }[];
  now: Date;
};
