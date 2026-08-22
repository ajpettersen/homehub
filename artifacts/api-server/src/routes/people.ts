import { Router } from "express";
import { db } from "@workspace/db";
import { peopleTable } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";

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
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((group): group is string => typeof group === "string")
      .map(group => group.trim())
      .filter(Boolean)
      .map(group => group.slice(0, 40)),
  )].slice(0, 8);
}

function personToJson(person: typeof peopleTable.$inferSelect) {
  return {
    id: String(person.id),
    name: person.name,
    groups: person.groups ?? [],
    notes: person.notes ?? null,
    createdAt: person.createdAt instanceof Date ? person.createdAt.toISOString() : String(person.createdAt),
  };
}

router.get("/people", async (_req, res) => {
  try {
    const people = await db.select().from(peopleTable).orderBy(asc(peopleTable.name));
    res.json(people.map(personToJson));
  } catch (err) {
    console.error("Failed to get people:", err);
    res.status(500).json({ error: "Failed to load people" });
  }
});

router.post("/people", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 1000) : null;
    const groups = normalizeGroups(req.body?.groups);

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (name.length > 120) {
      res.status(400).json({ error: "name must be 120 characters or fewer" });
      return;
    }

    const [person] = await db.insert(peopleTable).values({ name: name.slice(0, 120), groups, notes: notes || null }).returning();
    res.status(201).json(personToJson(person));
  } catch (err) {
    console.error("Failed to create person:", err);
    res.status(500).json({ error: "Failed to create person" });
  }
});

router.put("/people/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const updates: { name?: string; groups?: string[]; notes?: string | null } = {};
    if (req.body?.name !== undefined) {
      const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name || name.length > 120) {
        res.status(400).json({ error: "name must be between 1 and 120 characters" });
        return;
      }
      updates.name = name;
    }
    if (req.body?.groups !== undefined) updates.groups = normalizeGroups(req.body.groups);
    if (req.body?.notes !== undefined) {
      updates.notes = typeof req.body.notes === "string" ? req.body.notes.trim().slice(0, 1000) || null : null;
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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.delete(peopleTable).where(eq(peopleTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("Failed to delete person:", err);
    res.status(500).json({ error: "Failed to delete person" });
  }
});

export { DEFAULT_GROUPS };
export default router;