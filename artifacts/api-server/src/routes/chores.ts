import { Router } from "express";
import { db } from "@workspace/db";
import {
  choresTable,
  familyMembersTable,
  propertiesTable,
  walletTransactionsTable,
} from "@workspace/db";
import { eq, and, inArray, lt } from "drizzle-orm";
import {
  getApprovedHouseholdScope,
  requireApprovedLinkedAdult,
} from "../middlewares/requireApprovedHousehold";

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
    rewardCents: chore.rewardCents,
    bundleItems: chore.bundleItems,
    status: chore.status,
  };
}

function parsePaidChoreFields(rewardCents: unknown, bundleItems: unknown) {
  const reward = rewardCents === undefined ? undefined : Number(rewardCents);
  if (
    reward !== undefined &&
    (!Number.isInteger(reward) || reward < 0 || reward > 2_147_483_647)
  ) {
    return { error: "rewardCents must be a non-negative 32-bit integer" } as const;
  }
  if (
    bundleItems !== undefined &&
    (!Array.isArray(bundleItems) ||
      bundleItems.some(item => typeof item !== "string" || item.trim().length === 0))
  ) {
    return { error: "bundleItems must be an array of non-empty strings" } as const;
  }
  return {
    reward,
    bundleItems: bundleItems === undefined
      ? undefined
      : (bundleItems as string[]).map(item => item.trim()),
  };
}

function completionWindowElapsed(
  chore: typeof choresTable.$inferSelect,
  now: number,
) {
  if (!chore.completedAt) return false;
  const ageHours = (now - chore.completedAt.getTime()) / (1000 * 60 * 60);
  switch (chore.frequency) {
    case "daily": return ageHours >= 20;
    case "weekly": return ageHours >= 6 * 24;
    case "biweekly": return ageHours >= 13 * 24;
    case "monthly": return ageHours >= 28 * 24;
    default: return ageHours >= 20;
  }
}

function occurrenceKeyFor(completedAt: Date) {
  // `Date#getTime()` has millisecond precision and survives a PG timestamp
  // round-trip, unlike a locale/string representation.
  return String(completedAt.getTime());
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

    // A recurring occurrence is a fresh submission once its completion window
    // passes. Pending paid work is intentionally excluded: it must be reviewed
    // or rejected, never silently reopened by a list request.
    const now = Date.now();
    const reopened = await Promise.all(rows
      .filter(row =>
        row.chore.status === "approved" &&
        completionWindowElapsed(row.chore, now),
      )
      .map(async row => {
        const [updated] = await db.update(choresTable).set({
          status: "open",
          completedAt: null,
          completedBy: null,
          completionNote: null,
        }).where(and(
          eq(choresTable.id, row.chore.id),
          eq(choresTable.status, "approved"),
          eq(choresTable.completedAt, row.chore.completedAt!),
          inArray(choresTable.propertyId, scopedPropertyIds),
        )).returning();
        return updated;
      }));
    const reopenedById = new Map(
      reopened.filter((chore): chore is typeof choresTable.$inferSelect => Boolean(chore))
        .map(chore => [chore.id, chore]),
    );
    const currentRows = rows.map(row => ({
      ...row,
      chore: reopenedById.get(row.chore.id) ?? row.chore,
    }));

    let filtered = currentRows;
    if (assigneeId) {
      filtered = filtered.filter(
        (r) => String(r.chore.assigneeId) === String(assigneeId),
      );
    }

    // Hide chores that were recently completed. At the frequency boundary they
    // were reopened above and are returned as the next occurrence.
    filtered = filtered.filter((r) => {
      if (r.chore.status === "pending") return true;
      return !r.chore.completedAt;
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
    const { title, assigneeId, propertyId, frequency, dueDate, points, rewardCents, bundleItems } = req.body;

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
    const paidFields = parsePaidChoreFields(rewardCents, bundleItems);
    if ("error" in paidFields) {
      res.status(400).json({ error: paidFields.error });
      return;
    }
    if ((paidFields.reward ?? 0) > 0) {
      if (assignee.value === null) {
        res.status(400).json({ error: "Paid chores require a child assignee" });
        return;
      }
      const [child] = await db.select({ id: familyMembersTable.id }).from(familyMembersTable)
        .where(and(
          eq(familyMembersTable.id, assignee.value),
          eq(familyMembersTable.householdId, scope.householdId),
          eq(familyMembersTable.role, "child"),
        )).limit(1);
      if (!child) {
        res.status(400).json({ error: "Paid chores require a child assignee" });
        return;
      }
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
        rewardCents: paidFields.reward ?? 0,
        bundleItems: paidFields.bundleItems ?? [],
        status: "open",
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
    const { title, assigneeId, propertyId, frequency, dueDate, points, rewardCents, bundleItems } = req.body;

    // Ensure the target chore exists within the authorized properties.
    const [existing] = await db
      .select()
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
    if (existing.rewardCents > 0 && existing.status !== "open") {
      res.status(409).json({ error: "A submitted or approved paid chore cannot be edited" });
      return;
    }
    const paidFields = parsePaidChoreFields(rewardCents, bundleItems);
    if ("error" in paidFields) {
      res.status(400).json({ error: paidFields.error });
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
    const resultingReward = paidFields.reward ?? existing.rewardCents;
    const resultingAssignee = assigneeId !== undefined
      ? resolvedAssigneeId
      : existing.assigneeId;
    if (resultingReward > 0) {
      if (resultingAssignee == null) {
        res.status(400).json({ error: "Paid chores require a child assignee" });
        return;
      }
      const [child] = await db.select({ id: familyMembersTable.id }).from(familyMembersTable)
        .where(and(
          eq(familyMembersTable.id, resultingAssignee),
          eq(familyMembersTable.householdId, scope.householdId),
          eq(familyMembersTable.role, "child"),
        )).limit(1);
      if (!child) {
        res.status(400).json({ error: "Paid chores require a child assignee" });
        return;
      }
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
        ...(paidFields.reward !== undefined && { rewardCents: paidFields.reward }),
        ...(paidFields.bundleItems !== undefined && { bundleItems: paidFields.bundleItems }),
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

    const [rewardTransaction] = await db
      .select({ id: walletTransactionsTable.id })
      .from(walletTransactionsTable)
      .innerJoin(choresTable, eq(walletTransactionsTable.choreId, choresTable.id))
      .where(and(
        eq(choresTable.id, id),
        eq(walletTransactionsTable.householdId, scope.householdId),
        inArray(choresTable.propertyId, scope.propertyIds),
      ))
      .limit(1);
    if (rewardTransaction) {
      res.status(409).json({ error: "A rewarded chore cannot be deleted" });
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

    const [existing] = await db.select().from(choresTable).where(and(
      eq(choresTable.id, id),
      inArray(choresTable.propertyId, scope.propertyIds),
    )).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.rewardCents > 0 && existing.status === "approved") {
      res.status(409).json({ error: "Paid chore reward has already been approved" });
      return;
    }
    if (existing.rewardCents > 0 && existing.status === "pending") {
      res.status(409).json({ error: "Paid chore is already submitted for approval" });
      return;
    }

    const updated = await db
      .update(choresTable)
      .set({
        completedAt: new Date(),
        completedBy: completedBy ?? "Family",
        completionNote: note ?? null,
        status: existing.rewardCents > 0 ? "pending" : "approved",
      })
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

router.post("/chores/:id/approve", async (req, res) => {
  const scope = requireApprovedLinkedAdult(res);
  if (!scope) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const result = await db.transaction(async tx => {
      const [chore] = await tx.select().from(choresTable).where(and(
        eq(choresTable.id, id),
        inArray(choresTable.propertyId, scope.propertyIds),
      )).limit(1).for("update");
      if (!chore) return { kind: "missing" } as const;
      if (chore.rewardCents <= 0 || chore.assigneeId === null) {
        return { kind: "invalid" } as const;
      }
      const [child] = await tx.select({ id: familyMembersTable.id })
        .from(familyMembersTable)
        .where(and(
          eq(familyMembersTable.id, chore.assigneeId),
          eq(familyMembersTable.householdId, scope.householdId),
          eq(familyMembersTable.role, "child"),
        )).limit(1);
      if (!child) return { kind: "invalid" } as const;
      if (chore.status !== "pending" && chore.status !== "approved") {
        return { kind: "notPending" } as const;
      }
      if (!chore.completedAt) return { kind: "notPending" } as const;
      // This insert also repairs an approved row if an earlier deployment ever
      // left it without its credit. The partial unique index makes retries no-op.
      await tx.insert(walletTransactionsTable).values({
        householdId: scope.householdId,
        memberId: chore.assigneeId,
        amountCents: chore.rewardCents,
        type: "chore_reward",
        description: `Chore reward: ${chore.title}`,
        choreId: chore.id,
        occurrenceKey: occurrenceKeyFor(chore.completedAt),
        createdBy: scope.clerkId,
      }).onConflictDoNothing();
      if (chore.status === "pending") {
        await tx.update(choresTable).set({ status: "approved" })
          .where(eq(choresTable.id, chore.id));
      }
      return { kind: "ok", chore: { ...chore, status: "approved" } } as const;
    });
    if (result.kind === "missing") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "invalid") {
      res.status(400).json({ error: "Only assigned paid chores can be approved" });
      return;
    }
    if (result.kind === "notPending") {
      res.status(409).json({ error: "Chore has not been submitted for approval" });
      return;
    }
    res.json({ id: String(result.chore.id), status: result.chore.status });
  } catch (err) {
    req.log.error({ err }, "Failed to approve chore");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/chores/:id/reject", async (req, res) => {
  const scope = requireApprovedLinkedAdult(res);
  if (!scope) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const updated = await db.update(choresTable).set({
      status: "open",
      completedAt: null,
      completedBy: null,
      completionNote: null,
    }).where(and(
      eq(choresTable.id, id),
      eq(choresTable.status, "pending"),
      inArray(choresTable.propertyId, scope.propertyIds),
    )).returning({ id: choresTable.id });
    if (!updated.length) {
      res.status(409).json({ error: "Pending chore not found" });
      return;
    }
    res.json({ id: String(id), status: "open" });
  } catch (err) {
    req.log.error({ err }, "Failed to reject chore");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
