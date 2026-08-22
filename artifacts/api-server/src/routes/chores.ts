import { Router } from "express";
import { db } from "@workspace/db";
import {
  choresTable,
  familyMembersTable,
  propertiesTable,
} from "@workspace/db";
import { eq, and, inArray, lt } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

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

/**
 * Validates the optional assigneeId from a request body. Returns:
 *  - { ok: true, value: number | null } when the assignee is null/absent or a
 *    family member belonging to the authorized household.
 *  - { ok: false, status } when the id is malformed (400) or references a member
 *    outside the household (403).
 */
async function resolveAssigneeId(
  rawAssigneeId: unknown,
  householdId: number,
): Promise<
  | { ok: true; value: number | null }
  | { ok: false; status: 400 | 403 }
> {
  if (rawAssigneeId === undefined || rawAssigneeId === null || rawAssigneeId === "") {
    return { ok: true, value: null };
  }
  const assigneeId = Number(rawAssigneeId);
  if (!Number.isInteger(assigneeId)) {
    return { ok: false, status: 400 };
  }
  const [member] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.id, assigneeId),
      eq(familyMembersTable.householdId, householdId),
    ))
    .limit(1);
  if (!member) {
    return { ok: false, status: 403 };
  }
  return { ok: true, value: assigneeId };
}

router.get("/chores", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    if (scope.propertyIds.length === 0) {
      res.json([]);
      return;
    }

    const { assigneeId, propertyId } = req.query;

    let scopedPropertyIds = scope.propertyIds;
    if (propertyId !== undefined) {
      const requested = Number(propertyId);
      if (!Number.isInteger(requested)) {
        res.status(400).json({ error: "Invalid propertyId" });
        return;
      }
      if (!scope.propertyIds.includes(requested)) {
        res.status(403).json({ error: "Unauthorized property" });
        return;
      }
      scopedPropertyIds = [requested];
    }

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
      .where(inArray(choresTable.propertyId, scopedPropertyIds))
      .orderBy(choresTable.dueDate, choresTable.id);

    let filtered = rows;
    if (assigneeId) {
      filtered = filtered.filter(
        (r) => String(r.chore.assigneeId) === String(assigneeId),
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
    const scope = getApprovedHouseholdScope(res);
    const { title, assigneeId, propertyId, frequency, dueDate, points } = req.body;

    if (!title || !propertyId || !frequency) {
      res.status(400).json({ error: "title, propertyId, frequency required" });
      return;
    }

    const propertyIdNum = Number(propertyId);
    if (!Number.isInteger(propertyIdNum)) {
      res.status(400).json({ error: "Invalid propertyId" });
      return;
    }
    if (!scope.propertyIds.includes(propertyIdNum)) {
      res.status(403).json({ error: "Unauthorized property" });
      return;
    }

    const assignee = await resolveAssigneeId(assigneeId, scope.householdId);
    if (!assignee.ok) {
      res.status(assignee.status).json({
        error: assignee.status === 400 ? "Invalid assigneeId" : "Unauthorized assignee",
      });
      return;
    }

    const [chore] = await db
      .insert(choresTable)
      .values({
        title,
        assigneeId: assignee.value,
        propertyId: propertyIdNum,
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
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { title, assigneeId, propertyId, frequency, dueDate, points } = req.body;

    // Ensure the target chore exists within the authorized properties.
    const [existing] = await db
      .select({ id: choresTable.id })
      .from(choresTable)
      .where(and(
        eq(choresTable.id, id),
        inArray(choresTable.propertyId, scope.propertyIds),
      ))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let propertyIdNum: number | undefined;
    if (propertyId !== undefined) {
      propertyIdNum = Number(propertyId);
      if (!Number.isInteger(propertyIdNum)) {
        res.status(400).json({ error: "Invalid propertyId" });
        return;
      }
      if (!scope.propertyIds.includes(propertyIdNum)) {
        res.status(403).json({ error: "Unauthorized property" });
        return;
      }
    }

    let resolvedAssigneeId: number | null | undefined;
    if (assigneeId !== undefined) {
      const assignee = await resolveAssigneeId(assigneeId, scope.householdId);
      if (!assignee.ok) {
        res.status(assignee.status).json({
          error: assignee.status === 400 ? "Invalid assigneeId" : "Unauthorized assignee",
        });
        return;
      }
      resolvedAssigneeId = assignee.value;
    }

    await db
      .update(choresTable)
      .set({
        ...(title !== undefined && { title }),
        ...(assigneeId !== undefined && { assigneeId: resolvedAssigneeId }),
        ...(propertyIdNum !== undefined && { propertyId: propertyIdNum }),
        ...(frequency !== undefined && { frequency }),
        ...(dueDate !== undefined && { dueDate: dueDate ?? null }),
        ...(points !== undefined && { points }),
      })
      .where(and(
        eq(choresTable.id, id),
        inArray(choresTable.propertyId, scope.propertyIds),
      ));

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
    const scope = getApprovedHouseholdScope(res);
    if (scope.propertyIds.length === 0) {
      res.json({ updated: 0 });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const stale = await db
      .select()
      .from(choresTable)
      .where(and(
        lt(choresTable.dueDate, today),
        inArray(choresTable.propertyId, scope.propertyIds),
      ));

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
        .where(and(
          eq(choresTable.id, chore.id),
          inArray(choresTable.propertyId, scope.propertyIds),
        ));
    }

    res.json({ updated: overdue.length });
  } catch (err) {
    req.log.error({ err }, "Failed to snooze overdue chores");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/chores/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const deleted = await db
      .delete(choresTable)
      .where(and(
        eq(choresTable.id, id),
        inArray(choresTable.propertyId, scope.propertyIds),
      ))
      .returning({ id: choresTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete chore");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/chores/:id/complete", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (scope.propertyIds.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { completedBy, note } = req.body;

    const updated = await db
      .update(choresTable)
      .set({ completedAt: new Date(), completedBy: completedBy ?? "Family", completionNote: note ?? null })
      .where(and(
        eq(choresTable.id, id),
        inArray(choresTable.propertyId, scope.propertyIds),
      ))
      .returning({ id: choresTable.id });

    if (updated.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

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
