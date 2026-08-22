import { Router } from "express";
import { db } from "@workspace/db";
import {
  choresTable,
  familyMembersTable,
  propertiesTable,
} from "@workspace/db";
import { eq, and, isNull, lt, sql } from "drizzle-orm";

const router = Router();

function formatChore(
  chore: typeof choresTable.$inferSelect,
  assigneeName: string | null,
  assigneeColor: string | null,
  propertyName: string,
) {
  const today = new Date().toISOString().split("T")[0];
  const isOverdue =
    !chore.completedAt &&
    chore.dueDate != null &&
    chore.dueDate < today;

  return {
    id: String(chore.id),
    title: chore.title,
    assigneeId: chore.assigneeId ? String(chore.assigneeId) : null,
    assigneeName: assigneeName ?? null,
    assigneeColor: assigneeColor ?? null,
    propertyId: String(chore.propertyId),
    propertyName,
    frequency: chore.frequency,
    dueDate: chore.dueDate ?? null,
    completedAt: chore.completedAt?.toISOString() ?? null,
    completedBy: chore.completedBy ?? null,
    completionNote: chore.completionNote ?? null,
    isOverdue,
    points: chore.points,
  };
}

router.get("/chores", async (req, res) => {
  try {
    const { assigneeId, propertyId } = req.query;

    const rows = await db
      .select({
        chore: choresTable,
        assigneeName: familyMembersTable.name,
        assigneeColor: familyMembersTable.color,
        propertyName: propertiesTable.name,
      })
      .from(choresTable)
      .leftJoin(familyMembersTable, eq(choresTable.assigneeId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(choresTable.propertyId, propertiesTable.id))
      .orderBy(choresTable.dueDate, choresTable.id);

    let filtered = rows;
    if (assigneeId) {
      filtered = filtered.filter(
        (r) => String(r.chore.assigneeId) === String(assigneeId),
      );
    }
    if (propertyId) {
      filtered = filtered.filter(
        (r) => String(r.chore.propertyId) === String(propertyId),
      );
    }

    // Hide chores that were recently completed (they'll reappear after their frequency window)
    const now = Date.now();
    filtered = filtered.filter((r) => {
      const completedAt = r.chore.completedAt;
      if (!completedAt) return true;
      const ageHours = (now - completedAt.getTime()) / (1000 * 60 * 60);
      switch (r.chore.frequency) {
        case 'daily':    return ageHours >= 20;
        case 'weekly':   return ageHours >= 6 * 24;
        case 'biweekly': return ageHours >= 13 * 24;
        case 'monthly':  return ageHours >= 28 * 24;
        default:         return ageHours >= 20;
      }
    });

    res.json(
      filtered.map((r) =>
        formatChore(r.chore, r.assigneeName ?? null, r.assigneeColor ?? null, r.propertyName ?? ""),
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get chores");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/chores", async (req, res) => {
  try {
    const { title, assigneeId, propertyId, frequency, dueDate, points } = req.body;

    if (!title || !propertyId || !frequency) {
      res.status(400).json({ error: "title, propertyId, frequency required" });
      return;
    }

    const [chore] = await db
      .insert(choresTable)
      .values({
        title,
        assigneeId: assigneeId ? Number(assigneeId) : null,
        propertyId: Number(propertyId),
        frequency,
        dueDate: dueDate ?? null,
        points: points ?? 10,
      })
      .returning();

    const rows = await db
      .select({
        chore: choresTable,
        assigneeName: familyMembersTable.name,
        assigneeColor: familyMembersTable.color,
        propertyName: propertiesTable.name,
      })
      .from(choresTable)
      .leftJoin(familyMembersTable, eq(choresTable.assigneeId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(choresTable.propertyId, propertiesTable.id))
      .where(eq(choresTable.id, chore.id));

    const row = rows[0];
    res.status(201).json(
      formatChore(row.chore, row.assigneeName ?? null, row.assigneeColor ?? null, row.propertyName ?? ""),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to create chore");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/chores/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, assigneeId, propertyId, frequency, dueDate, points } = req.body;

    await db
      .update(choresTable)
      .set({
        ...(title !== undefined && { title }),
        ...(assigneeId !== undefined && { assigneeId: assigneeId ? Number(assigneeId) : null }),
        ...(propertyId !== undefined && { propertyId: Number(propertyId) }),
        ...(frequency !== undefined && { frequency }),
        ...(dueDate !== undefined && { dueDate: dueDate ?? null }),
        ...(points !== undefined && { points }),
      })
      .where(eq(choresTable.id, id));

    const rows = await db
      .select({
        chore: choresTable,
        assigneeName: familyMembersTable.name,
        assigneeColor: familyMembersTable.color,
        propertyName: propertiesTable.name,
      })
      .from(choresTable)
      .leftJoin(familyMembersTable, eq(choresTable.assigneeId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(choresTable.propertyId, propertiesTable.id))
      .where(eq(choresTable.id, id));

    if (!rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const row = rows[0];
    res.json(formatChore(row.chore, row.assigneeName ?? null, row.assigneeColor ?? null, row.propertyName ?? ""));
  } catch (err) {
    req.log.error({ err }, "Failed to update chore");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Advance all overdue (incomplete) chore due dates to today or later
router.post("/chores/snooze-overdue", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const stale = await db
      .select()
      .from(choresTable)
      .where(lt(choresTable.dueDate, today));

    const overdue = stale.filter((c) => !c.completedAt);
    if (!overdue.length) {
      res.json({ updated: 0 });
      return;
    }

    const freqDays: Record<string, number> = {
      daily: 1,
      weekly: 7,
      biweekly: 14,
      monthly: 30,
    };

    for (const chore of overdue) {
      const days = freqDays[chore.frequency] ?? 7;
      let d = new Date(chore.dueDate!);
      const todayDate = new Date(today);
      while (d < todayDate) {
        d.setDate(d.getDate() + days);
      }
      const fixed = d.toISOString().split("T")[0];
      await db
        .update(choresTable)
        .set({ dueDate: fixed })
        .where(eq(choresTable.id, chore.id));
    }

    res.json({ updated: overdue.length });
  } catch (err) {
    req.log.error({ err }, "Failed to snooze overdue chores");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/chores/:id", async (req, res) => {
  try {
    await db.delete(choresTable).where(eq(choresTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete chore");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/chores/:id/complete", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { completedBy, note } = req.body;

    await db
      .update(choresTable)
      .set({ completedAt: new Date(), completedBy: completedBy ?? "Family", completionNote: note ?? null })
      .where(eq(choresTable.id, id));

    const rows = await db
      .select({
        chore: choresTable,
        assigneeName: familyMembersTable.name,
        assigneeColor: familyMembersTable.color,
        propertyName: propertiesTable.name,
      })
      .from(choresTable)
      .leftJoin(familyMembersTable, eq(choresTable.assigneeId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(choresTable.propertyId, propertiesTable.id))
      .where(eq(choresTable.id, id));

    if (!rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const row = rows[0];
    res.json(formatChore(row.chore, row.assigneeName ?? null, row.assigneeColor ?? null, row.propertyName ?? ""));
  } catch (err) {
    req.log.error({ err }, "Failed to complete chore");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
