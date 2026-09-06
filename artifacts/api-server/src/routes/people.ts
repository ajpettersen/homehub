import { Router } from "express";
import { db } from "@workspace/db";
import { contractorsTable, peopleTable } from "@workspace/db/schema";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getAuthorizedPropertyIds } from "../lib/propertyAuthorization";
import { getEffectiveClerkId } from "../lib/effectiveClerkId";

const router = Router();

const DEFAULT_GROUPS = [
  "Baseball",
  "Cabin",
  "House neighbors",
  "PTO",
  "School",
  "Family friends",
];

function normalizeGroups(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(group => typeof group !== "string")) throw new Error("groups must be an array of strings");
  return [...new Set(
    value
      .map(group => group.trim())
      .filter(Boolean)
      .map(group => {
        if (group.length > 40) throw new Error("groups must be 40 characters or fewer");
        return group;
      }),
  )].slice(0, 8);
}

function personToJson(person: typeof peopleTable.$inferSelect) {
  return {
    id: String(person.id),
    propertyId: person.propertyId ? String(person.propertyId) : null,
    name: person.name,
    groups: person.groups ?? [],
    photoUrl: person.photoUrl ?? null,
    phone: person.phone ?? null,
    email: person.email ?? null,
    notes: person.notes ?? null,
    lastContactedAt: person.lastContactedAt ?? null,
    nextFollowUpAt: person.nextFollowUpAt ?? null,
    createdAt: person.createdAt instanceof Date ? person.createdAt.toISOString() : String(person.createdAt),
  };
}

function contractorToJson(contractor: typeof contractorsTable.$inferSelect, matchScore?: number) {
  return {
    id: String(contractor.id),
    propertyId: contractor.propertyId ? String(contractor.propertyId) : null,
    name: contractor.name,
    trade: contractor.trade,
    phone: contractor.phone ?? null,
    email: contractor.email ?? null,
    notes: contractor.notes ?? null,
    pastWork: contractor.pastWork ?? null,
    preferred: contractor.preferred,
    ...(matchScore === undefined ? {} : { matchScore }),
    createdAt: contractor.createdAt instanceof Date ? contractor.createdAt.toISOString() : String(contractor.createdAt),
  };
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("must be a string");
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`must be ${maxLength} characters or fewer`);
  return result || null;
}

function optionalDate(value: unknown): string | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? value : null;
}

function validateEmail(value: string | null): boolean {
  return value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasProvidedValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

async function getAuthorizedScope(req: any, res: any): Promise<number[] | null> {
  const clerkId = getEffectiveClerkId(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const propertyIds = await getAuthorizedPropertyIds(clerkId);
  if (propertyIds.length === 0) {
    res.status(403).json({ error: "No household property access" });
    return null;
  }

  return propertyIds;
}

function createPropertyId(req: any, propertyIds: number[]): number | null {
  if (req.body?.propertyId === undefined || req.body?.propertyId === null || req.body?.propertyId === "") {
    return propertyIds[0] ?? null;
  }
  const propertyId = Number(req.body.propertyId);
  return Number.isInteger(propertyId) && propertyIds.includes(propertyId) ? propertyId : null;
}

router.get("/people", async (req, res) => {
  try {
    const propertyIds = await getAuthorizedScope(req, res);
    if (!propertyIds) return;
    const people = await db.select().from(peopleTable)
      .where(inArray(peopleTable.propertyId, propertyIds))
      .orderBy(asc(peopleTable.name));
    res.json(people.map(personToJson));
  } catch (err) {
    console.error("Failed to get people:", err);
    res.status(500).json({ error: "Failed to load people" });
  }
});

router.post("/people", async (req, res) => {
  try {
    const propertyIds = await getAuthorizedScope(req, res);
    if (!propertyIds) return;
    const propertyId = createPropertyId(req, propertyIds);
    if (!propertyId) {
      res.status(403).json({ error: "Unauthorized property" });
      return;
    }
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    let notes: string | null;
    let groups: string[];
    let photoUrl: string | null;
    let phone: string | null;
    let email: string | null;
    try {
      notes = optionalText(req.body?.notes, 1000);
      groups = normalizeGroups(req.body?.groups);
      photoUrl = optionalText(req.body?.photoUrl, 1000);
      phone = optionalText(req.body?.phone, 40);
      email = optionalText(req.body?.email, 254);
    } catch {
      res.status(400).json({ error: "person fields have an invalid type or length" });
      return;
    }
    const lastContactedAt = optionalDate(req.body?.lastContactedAt);
    const nextFollowUpAt = optionalDate(req.body?.nextFollowUpAt);

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (name.length > 120) {
      res.status(400).json({ error: "name must be 120 characters or fewer" });
      return;
    }
    if (!validateEmail(email) || (req.body?.email !== undefined && req.body?.email !== null && req.body?.email !== "" && !email)) {
      res.status(400).json({ error: "email must be valid" });
      return;
    }
    if (hasProvidedValue(req.body?.lastContactedAt) && !lastContactedAt) {
      res.status(400).json({ error: "lastContactedAt must be a valid date" });
      return;
    }
    if (hasProvidedValue(req.body?.nextFollowUpAt) && !nextFollowUpAt) {
      res.status(400).json({ error: "nextFollowUpAt must be a valid date" });
      return;
    }

    const [person] = await db.insert(peopleTable).values({
      propertyId,
      name: name.slice(0, 120),
      groups,
      photoUrl,
      phone,
      email,
      notes,
      lastContactedAt,
      nextFollowUpAt,
    }).returning();
    res.status(201).json(personToJson(person));
  } catch (err) {
    console.error("Failed to create person:", err);
    res.status(500).json({ error: "Failed to create person" });
  }
});

router.put("/people/:id", async (req, res) => {
  try {
    const propertyIds = await getAuthorizedScope(req, res);
    if (!propertyIds) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db.select({ propertyId: peopleTable.propertyId })
      .from(peopleTable)
      .where(eq(peopleTable.id, id))
      .limit(1);
    if (!existing || !existing.propertyId || !propertyIds.includes(existing.propertyId)) {
      res.status(404).json({ error: "Person not found" });
      return;
    }

    const updates: {
      name?: string;
      groups?: string[];
      notes?: string | null;
      photoUrl?: string | null;
      phone?: string | null;
      email?: string | null;
      lastContactedAt?: string | null;
      nextFollowUpAt?: string | null;
    } = {};
    if (req.body?.name !== undefined) {
      const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name || name.length > 120) {
        res.status(400).json({ error: "name must be between 1 and 120 characters" });
        return;
      }
      updates.name = name;
    }
    try {
      if (req.body?.groups !== undefined) updates.groups = normalizeGroups(req.body.groups);
      if (req.body?.notes !== undefined) updates.notes = optionalText(req.body.notes, 1000);
      if (req.body?.photoUrl !== undefined) updates.photoUrl = optionalText(req.body.photoUrl, 1000);
      if (req.body?.phone !== undefined) updates.phone = optionalText(req.body.phone, 40);
    } catch {
      res.status(400).json({ error: "person fields have an invalid type or length" });
      return;
    }
    if (req.body?.email !== undefined) {
      try {
        updates.email = optionalText(req.body.email, 254);
      } catch {
        res.status(400).json({ error: "contact fields must be strings" });
        return;
      }
      if (!validateEmail(updates.email) || (req.body.email !== null && req.body.email !== "" && !updates.email)) {
        res.status(400).json({ error: "email must be valid" });
        return;
      }
    }
    if (req.body?.lastContactedAt !== undefined) {
      updates.lastContactedAt = optionalDate(req.body.lastContactedAt);
      if (hasProvidedValue(req.body.lastContactedAt) && !updates.lastContactedAt) {
        res.status(400).json({ error: "lastContactedAt must be a valid date" });
        return;
      }
    }
    if (req.body?.nextFollowUpAt !== undefined) {
      updates.nextFollowUpAt = optionalDate(req.body.nextFollowUpAt);
      if (hasProvidedValue(req.body.nextFollowUpAt) && !updates.nextFollowUpAt) {
        res.status(400).json({ error: "nextFollowUpAt must be a valid date" });
        return;
      }
    }

    const [person] = await db.update(peopleTable).set(updates).where(eq(peopleTable.id, id)).returning();
    if (!person) {
      res.status(404).json({ error: "Person not found" });
      return;
    }
    res.json(personToJson(person));
  } catch (err) {
    console.error("Failed to update person:", err);
    res.status(500).json({ error: "Failed to update person" });
  }
});

router.delete("/people/:id", async (req, res) => {
  try {
    const propertyIds = await getAuthorizedScope(req, res);
    if (!propertyIds) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db.select({ propertyId: peopleTable.propertyId })
      .from(peopleTable)
      .where(eq(peopleTable.id, id))
      .limit(1);
    if (!existing || !existing.propertyId || !propertyIds.includes(existing.propertyId)) {
      res.status(404).json({ error: "Person not found" });
      return;
    }
    await db.delete(peopleTable).where(eq(peopleTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("Failed to delete person:", err);
    res.status(500).json({ error: "Failed to delete person" });
  }
});

// ── Contractor memory bank ────────────────────────────────────────────────────

function contractorInput(body: any) {
  if (body?.name !== undefined && typeof body.name !== "string") throw new Error("name must be a string");
  if (body?.trade !== undefined && typeof body.trade !== "string") throw new Error("trade must be a string");
  if (body?.preferred !== undefined && typeof body.preferred !== "boolean") throw new Error("preferred must be boolean");
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const trade = typeof body?.trade === "string" ? body.trade.trim() : "";
  if (name.length > 120 || trade.length > 120) throw new Error("name and trade must be 120 characters or fewer");
  return {
    name,
    trade,
    phone: optionalText(body?.phone, 40),
    email: optionalText(body?.email, 254),
    notes: optionalText(body?.notes, 1200),
    pastWork: optionalText(body?.pastWork, 1600),
    preferred: body?.preferred === true,
  };
}

function contractorTerms(text: string) {
  return [...new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(term => term.length > 2)
      .filter(term => !["the", "and", "for", "with", "need", "help", "have", "has", "from", "our", "house", "home"].includes(term)),
  )];
}

function rankContractor(contractor: typeof contractorsTable.$inferSelect, problem: string) {
  const terms = contractorTerms(problem);
  if (terms.length === 0) return contractor.preferred ? 1 : 0;
  const fields = [
    { value: contractor.trade, weight: 8 },
    { value: contractor.name, weight: 4 },
    { value: contractor.notes ?? "", weight: 3 },
    { value: contractor.pastWork ?? "", weight: 5 },
  ].map(field => ({ ...field, value: field.value.toLowerCase() }));
  const matched = terms.filter(term => fields.some(field => field.value.includes(term)));
  const score = matched.reduce(
    (total, term) => total + fields.reduce((fieldTotal, field) => fieldTotal + (field.value.includes(term) ? field.weight : 0), 0),
    0,
  );
  return score + (matched.length > 0 && contractor.preferred ? 50 : 0);
}

router.get("/contractors", async (req, res) => {
  try {
    const propertyIds = await getAuthorizedScope(req, res);
    if (!propertyIds) return;
    const contractors = await db.select().from(contractorsTable)
      .where(inArray(contractorsTable.propertyId, propertyIds))
      .orderBy(desc(contractorsTable.preferred), asc(contractorsTable.name));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (!search) {
      res.json(contractors.map(contractorToJson));
      return;
    }
    const ranked = contractors
      .map(contractor => ({ contractor, score: rankContractor(contractor, search) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.contractor.name.localeCompare(b.contractor.name));
    res.json(ranked.map(item => contractorToJson(item.contractor, item.score)));
  } catch (err) {
    console.error("Failed to get contractors:", err);
    res.status(500).json({ error: "Failed to load contractors" });
  }
});

router.post("/contractors/match", async (req, res) => {
  const problem = typeof req.body?.problem === "string" ? req.body.problem.trim().slice(0, 500) : "";
  if (!problem) {
    res.status(400).json({ error: "problem is required" });
    return;
  }
  try {
    const propertyIds = await getAuthorizedScope(req, res);
    if (!propertyIds) return;
    const contractors = await db.select().from(contractorsTable)
      .where(inArray(contractorsTable.propertyId, propertyIds));
    const matches = contractors
      .map(contractor => ({ contractor, score: rankContractor(contractor, problem) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.contractor.name.localeCompare(b.contractor.name));
    res.json({ problem, matches: matches.map(item => contractorToJson(item.contractor, item.score)) });
  } catch (err) {
    console.error("Failed to match contractors:", err);
    res.status(500).json({ error: "Failed to match contractors" });
  }
});

router.post("/contractors", async (req, res) => {
  let input: ReturnType<typeof contractorInput>;
  try {
    input = contractorInput(req.body);
  } catch {
    res.status(400).json({ error: "contractor fields must be strings" });
    return;
  }
  if (!input.name || !input.trade) {
    res.status(400).json({ error: "name and trade are required" });
    return;
  }
  if (!validateEmail(input.email) || (req.body?.email && !input.email)) {
    res.status(400).json({ error: "email must be valid" });
    return;
  }
  try {
    const propertyIds = await getAuthorizedScope(req, res);
    if (!propertyIds) return;
    const propertyId = createPropertyId(req, propertyIds);
    if (!propertyId) {
      res.status(403).json({ error: "Unauthorized property" });
      return;
    }
    const [contractor] = await db.insert(contractorsTable).values({ ...input, propertyId }).returning();
    res.status(201).json(contractorToJson(contractor));
  } catch (err) {
    console.error("Failed to create contractor:", err);
    res.status(500).json({ error: "Failed to create contractor" });
  }
});

router.put("/contractors/:id", async (req, res) => {
  let propertyIds: number[] | null;
  try {
    propertyIds = await getAuthorizedScope(req, res);
  } catch (err) {
    console.error("Failed to authorize contractor update:", err);
    res.status(500).json({ error: "Failed to authorize request" });
    return;
  }
  if (!propertyIds) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  let input: ReturnType<typeof contractorInput>;
  try {
    input = contractorInput(req.body);
  } catch {
    res.status(400).json({ error: "contractor fields must be strings" });
    return;
  }
  if (req.body?.name !== undefined && !input.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (req.body?.trade !== undefined && !input.trade) {
    res.status(400).json({ error: "trade is required" });
    return;
  }
  if (!validateEmail(input.email) || (req.body?.email && !input.email)) {
    res.status(400).json({ error: "email must be valid" });
    return;
  }
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "trade", "phone", "email", "notes", "pastWork", "preferred"]) {
    if (req.body?.[key] !== undefined) updates[key] = input[key as keyof typeof input];
  }
  try {
    const [existing] = await db.select({ propertyId: contractorsTable.propertyId })
      .from(contractorsTable)
      .where(eq(contractorsTable.id, id))
      .limit(1);
    if (!existing || !existing.propertyId || !propertyIds.includes(existing.propertyId)) {
      res.status(404).json({ error: "Contractor not found" });
      return;
    }
    const [contractor] = await db.update(contractorsTable).set(updates).where(eq(contractorsTable.id, id)).returning();
    if (!contractor) {
      res.status(404).json({ error: "Contractor not found" });
      return;
    }
    res.json(contractorToJson(contractor));
  } catch (err) {
    console.error("Failed to update contractor:", err);
    res.status(500).json({ error: "Failed to update contractor" });
  }
});

router.delete("/contractors/:id", async (req, res) => {
  let propertyIds: number[] | null;
  try {
    propertyIds = await getAuthorizedScope(req, res);
  } catch (err) {
    console.error("Failed to authorize contractor delete:", err);
    res.status(500).json({ error: "Failed to authorize request" });
    return;
  }
  if (!propertyIds) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [existing] = await db.select({ propertyId: contractorsTable.propertyId })
      .from(contractorsTable)
      .where(eq(contractorsTable.id, id))
      .limit(1);
    if (!existing || !existing.propertyId || !propertyIds.includes(existing.propertyId)) {
      res.status(404).json({ error: "Contractor not found" });
      return;
    }
    const deleted = await db.delete(contractorsTable).where(eq(contractorsTable.id, id)).returning({ id: contractorsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Contractor not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error("Failed to delete contractor:", err);
    res.status(500).json({ error: "Failed to delete contractor" });
  }
});

export { DEFAULT_GROUPS };
export default router;