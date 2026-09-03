import { Router } from "express";
import { db } from "@workspace/db";
import { maintenanceTasksTable, propertiesTable, familyMembersTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();

function normalizeTaskTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isValidFrequencyDays(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 3650;
}

/**
 * Validates an optional assignee id: it must be a family member of the scope's
 * household. Returns { ok: true, value } (null when unassigned) or an error status.
 */
async function resolveAssigneeId(
  rawAssigneeId: unknown,
  householdId: number,
): Promise<{ ok: true; value: number | null } | { ok: false; status: 400 | 403 }> {
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

/** Re-reads one task with its property and assignee joined, formatted for the API. */
async function fetchFormattedTask(id: number) {
  const rows = await db
    .select({
      task: maintenanceTasksTable,
      propertyName: propertiesTable.name,
      assigneeName: familyMembersTable.name,
      assigneeColor: familyMembersTable.color,
    })
    .from(maintenanceTasksTable)
    .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
    .leftJoin(familyMembersTable, eq(maintenanceTasksTable.assigneeId, familyMembersTable.id))
    .where(eq(maintenanceTasksTable.id, id));
  if (!rows.length) return null;
  return formatTask(rows[0].task, rows[0].propertyName ?? "", rows[0].assigneeName, rows[0].assigneeColor);
}

/**
 * Given a startDate anchor and a frequency, return the next occurrence on or
 * after `afterDate`.  If startDate is still in the future it is returned as-is.
 */
function getNextAnchoredDate(startDate: string, frequencyDays: number, afterDate: Date): string {
  const start = new Date(startDate + "T00:00:00Z");
  const after = new Date(afterDate.toISOString().split("T")[0] + "T00:00:00Z");

  if (start >= after) return startDate;

  const diffMs = after.getTime() - start.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const multiplier = Math.ceil(diffDays / frequencyDays);

  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + multiplier * frequencyDays);
  return next.toISOString().split("T")[0];
}

function formatTask(
  task: typeof maintenanceTasksTable.$inferSelect,
  propertyName: string,
  assigneeName: string | null = null,
  assigneeColor: string | null = null,
) {
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const sevenDaysStr = sevenDaysOut.toISOString().split("T")[0];
  const effectiveNextDueDate =
    task.scheduleType === "recurring" && task.lastCompletedAt === null
      ? today
      : task.nextDueDate;

  const isOverdue = effectiveNextDueDate < today;
  const isDueSoon = !isOverdue && effectiveNextDueDate <= sevenDaysStr;

  return {
    id: String(task.id),
    title: task.title,
    description: task.description ?? null,
    propertyId: String(task.propertyId),
    propertyName,
    category: task.category,
    assigneeId: task.assigneeId ? String(task.assigneeId) : null,
    assigneeName: task.assigneeId ? assigneeName : null,
    assigneeColor: task.assigneeId ? assigneeColor : null,
    frequencyDays: task.frequencyDays ?? null,
    scheduleType: task.scheduleType,
    isCompleted: task.isCompleted,
    isCleanerTask: task.isCleanerTask,
    startDate: task.startDate ?? null,
    lastCompletedAt: task.lastCompletedAt?.toISOString() ?? null,
    lastCompletedBy: task.lastCompletedBy ?? null,
    nextDueDate: effectiveNextDueDate,
    isOverdue,
    isDueSoon,
  };
}

router.get("/maintenance-tasks", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    if (scope.propertyIds.length === 0) {
      res.json([]);
      return;
    }

    const { propertyId } = req.query;

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
        task: maintenanceTasksTable,
        propertyName: propertiesTable.name,
        assigneeName: familyMembersTable.name,
        assigneeColor: familyMembersTable.color,
      })
      .from(maintenanceTasksTable)
      .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
      .leftJoin(familyMembersTable, eq(maintenanceTasksTable.assigneeId, familyMembersTable.id))
      .where(inArray(maintenanceTasksTable.propertyId, scopedPropertyIds))
      .orderBy(maintenanceTasksTable.nextDueDate);

    const filtered = rows.filter(
      ({ task }) => !(task.scheduleType === "one-time" && task.isCompleted),
    );

    res.json(filtered.map((r) => formatTask(r.task, r.propertyName ?? "", r.assigneeName, r.assigneeColor)));
  } catch (err) {
    req.log.error({ err }, "Failed to get maintenance tasks");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/maintenance-tasks", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const { title, description, propertyId, category, assigneeId, frequencyDays, scheduleType, startDate, nextDueDate, isCleanerTask } = req.body;
    const effectiveScheduleType = scheduleType ?? "recurring";
    if (!title || typeof title !== "string" || !propertyId || !category) {
      res.status(400).json({ error: "title, propertyId, and category are required" });
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

    if (effectiveScheduleType !== "recurring" && effectiveScheduleType !== "one-time") {
      res.status(400).json({ error: "scheduleType must be recurring or one-time" });
      return;
    }

    const freq = effectiveScheduleType === "recurring" ? frequencyDays : null;
    if (effectiveScheduleType === "recurring" && !isValidFrequencyDays(freq)) {
      res.status(400).json({ error: "A recurring task needs a repeat interval from 1 to 3650 days" });
      return;
    }
    if (effectiveScheduleType === "one-time" && !nextDueDate) {
      res.status(400).json({ error: "A one-time task needs a due date" });
      return;
    }

    const assignee = await resolveAssigneeId(assigneeId, scope.householdId);
    if (!assignee.ok) {
      res.status(assignee.status).json({
        error: assignee.status === 400 ? "Invalid assigneeId" : "Assignee not accessible",
      });
      return;
    }

    // A newly-created recurring task is actionable immediately. The optional
    // start date remains the recurrence anchor used after the first completion.
    const resolvedNextDueDate = effectiveScheduleType === "recurring"
      ? new Date().toISOString().split("T")[0]
      : nextDueDate;

    const normalizedTitle = normalizeTaskTitle(title);
    if (!normalizedTitle) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const task = await db.transaction(async (tx) => {
      // Serialize title checks for this property so concurrent retries cannot
      // create equivalent maintenance tasks.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${propertyIdNum})`);
      const existing = await tx
        .select({ title: maintenanceTasksTable.title })
        .from(maintenanceTasksTable)
        .where(eq(maintenanceTasksTable.propertyId, propertyIdNum));
      if (existing.some(candidate => normalizeTaskTitle(candidate.title) === normalizedTitle)) {
        return null;
      }
      const [created] = await tx
        .insert(maintenanceTasksTable)
        .values({
          title,
          description: description ?? null,
          propertyId: propertyIdNum,
          category,
          assigneeId: assignee.value,
          frequencyDays: freq,
          scheduleType: effectiveScheduleType,
          isCompleted: false,
          isCleanerTask: isCleanerTask === true,
          startDate: effectiveScheduleType === "recurring" ? startDate ?? null : null,
          nextDueDate: resolvedNextDueDate,
        })
        .returning();
      return created;
    });
    if (!task) {
      res.status(409).json({ error: "A maintenance task with that title already exists for this property" });
      return;
    }

    res.status(201).json(await fetchFormattedTask(task.id));
  } catch (err) {
    req.log.error({ err }, "Failed to create maintenance task");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/maintenance-tasks/:id", async (req, res) => {
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
    const { title, description, propertyId, category, assigneeId, frequencyDays, scheduleType, startDate, nextDueDate, isCleanerTask } = req.body;

    const [existing] = await db
      .select()
      .from(maintenanceTasksTable)
      .where(and(
        eq(maintenanceTasksTable.id, id),
        inArray(maintenanceTasksTable.propertyId, scope.propertyIds),
      ))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // A property change, if supplied, must target an authorized property.
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

    const effectiveScheduleType = scheduleType ?? existing.scheduleType;
    if (effectiveScheduleType !== "recurring" && effectiveScheduleType !== "one-time") {
      res.status(400).json({ error: "scheduleType must be recurring or one-time" });
      return;
    }

    // An assignee change, if supplied, must reference a member of this household.
    let resolvedAssigneeId: number | null | undefined;
    if (assigneeId !== undefined) {
      const assignee = await resolveAssigneeId(assigneeId, scope.householdId);
      if (!assignee.ok) {
        res.status(assignee.status).json({
          error: assignee.status === 400 ? "Invalid assigneeId" : "Assignee not accessible",
        });
        return;
      }
      resolvedAssigneeId = assignee.value;
    }

    let effectiveFrequencyDays: number | null = null;
    if (effectiveScheduleType === "recurring") {
      // Omitted frequency keeps the established recurrence interval. Supplied
      // values are intentionally not coerced from strings or other values.
      const candidateFrequency = frequencyDays !== undefined ? frequencyDays : existing.frequencyDays;
      if (!isValidFrequencyDays(candidateFrequency)) {
        res.status(400).json({ error: "A recurring task needs a repeat interval from 1 to 3650 days" });
        return;
      }
      effectiveFrequencyDays = candidateFrequency;
    }

    const effectiveStartDate = effectiveScheduleType === "recurring"
      ? (startDate !== undefined ? startDate : existing.startDate)
      : null;
    let resolvedNextDueDate = nextDueDate;
    if (effectiveScheduleType === "recurring" && (startDate !== undefined || frequencyDays !== undefined || scheduleType === "recurring")) {
      if (effectiveStartDate) {
        resolvedNextDueDate = getNextAnchoredDate(effectiveStartDate, effectiveFrequencyDays!, new Date());
      }
    }
    if (effectiveScheduleType === "one-time" && !resolvedNextDueDate) {
      resolvedNextDueDate = existing.nextDueDate;
    }

    await db
      .update(maintenanceTasksTable)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description ?? null }),
        ...(propertyIdNum !== undefined && { propertyId: propertyIdNum }),
        ...(category !== undefined && { category }),
        ...(resolvedAssigneeId !== undefined && { assigneeId: resolvedAssigneeId }),
        frequencyDays: effectiveFrequencyDays,
        scheduleType: effectiveScheduleType,
        startDate: effectiveStartDate ?? null,
        ...(resolvedNextDueDate !== undefined && { nextDueDate: resolvedNextDueDate }),
        ...(scheduleType !== undefined && { isCompleted: false }),
        ...(isCleanerTask !== undefined && { isCleanerTask: Boolean(isCleanerTask) }),
      })
      .where(and(
        eq(maintenanceTasksTable.id, id),
        inArray(maintenanceTasksTable.propertyId, scope.propertyIds),
      ));

    const formatted = await fetchFormattedTask(id);
    if (!formatted) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Failed to update maintenance task");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/maintenance-tasks/:id", async (req, res) => {
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
      .delete(maintenanceTasksTable)
      .where(and(
        eq(maintenanceTasksTable.id, id),
        inArray(maintenanceTasksTable.propertyId, scope.propertyIds),
      ))
      .returning({ id: maintenanceTasksTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete maintenance task");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/maintenance-tasks/:id/complete", async (req, res) => {
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
    const { completedBy } = req.body;

    const [existing] = await db
      .select()
      .from(maintenanceTasksTable)
      .where(and(
        eq(maintenanceTasksTable.id, id),
        inArray(maintenanceTasksTable.propertyId, scope.propertyIds),
      ))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (existing.scheduleType === "one-time") {
      await db
        .update(maintenanceTasksTable)
        .set({
          lastCompletedAt: new Date(),
          lastCompletedBy: completedBy ?? null,
          isCompleted: true,
        })
        .where(and(
          eq(maintenanceTasksTable.id, id),
          inArray(maintenanceTasksTable.propertyId, scope.propertyIds),
        ));
    } else {
      const nextDue = new Date();
      nextDue.setDate(nextDue.getDate() + existing.frequencyDays!);
      const nextDueDate = nextDue.toISOString().split("T")[0];

      await db
        .update(maintenanceTasksTable)
        .set({
          lastCompletedAt: new Date(),
          lastCompletedBy: completedBy ?? null,
          nextDueDate,
        })
        .where(and(
          eq(maintenanceTasksTable.id, id),
          inArray(maintenanceTasksTable.propertyId, scope.propertyIds),
        ));
    }

    res.json(await fetchFormattedTask(id));
  } catch (err) {
    req.log.error({ err }, "Failed to complete maintenance task");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
