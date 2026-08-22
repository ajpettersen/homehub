import { Router } from "express";
import { db } from "@workspace/db";
import { maintenanceTasksTable, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
) {
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const sevenDaysStr = sevenDaysOut.toISOString().split("T")[0];

  const isOverdue = task.nextDueDate < today;
  const isDueSoon = !isOverdue && task.nextDueDate <= sevenDaysStr;

  return {
    id: String(task.id),
    title: task.title,
    description: task.description ?? null,
    propertyId: String(task.propertyId),
    propertyName,
    category: task.category,
    frequencyDays: task.frequencyDays ?? null,
    scheduleType: task.scheduleType,
    isCompleted: task.isCompleted,
    isCleanerTask: task.isCleanerTask,
    startDate: task.startDate ?? null,
    lastCompletedAt: task.lastCompletedAt?.toISOString() ?? null,
    lastCompletedBy: task.lastCompletedBy ?? null,
    nextDueDate: task.nextDueDate,
    isOverdue,
    isDueSoon,
  };
}

router.get("/maintenance-tasks", async (req, res) => {
  try {
    const { propertyId } = req.query;

    const rows = await db
      .select({
        task: maintenanceTasksTable,
        propertyName: propertiesTable.name,
      })
      .from(maintenanceTasksTable)
      .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
      .orderBy(maintenanceTasksTable.nextDueDate);

    let filtered = rows.filter(
      ({ task }) => !(task.scheduleType === "one-time" && task.isCompleted),
    );
    if (propertyId) {
      filtered = filtered.filter((r) => String(r.task.propertyId) === String(propertyId));
    }

    res.json(filtered.map((r) => formatTask(r.task, r.propertyName ?? "")));
  } catch (err) {
    req.log.error({ err }, "Failed to get maintenance tasks");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/maintenance-tasks", async (req, res) => {
  try {
    const { title, description, propertyId, category, frequencyDays, scheduleType, startDate, nextDueDate, isCleanerTask } = req.body;
    const effectiveScheduleType = scheduleType ?? "recurring";
    if (!title || !propertyId || !category) {
      res.status(400).json({ error: "title, propertyId, and category are required" });
      return;
    }
    if (effectiveScheduleType !== "recurring" && effectiveScheduleType !== "one-time") {
      res.status(400).json({ error: "scheduleType must be recurring or one-time" });
      return;
    }

    const freq = effectiveScheduleType === "recurring" ? Number(frequencyDays) : null;
    if (effectiveScheduleType === "recurring" && (!Number.isInteger(freq) || (freq ?? 0) < 1)) {
      res.status(400).json({ error: "A recurring task needs a positive repeat interval" });
      return;
    }
    if (effectiveScheduleType === "one-time" && !nextDueDate) {
      res.status(400).json({ error: "A one-time task needs a due date" });
      return;
    }

    let resolvedNextDueDate: string;
    if (effectiveScheduleType === "recurring" && startDate) {
      resolvedNextDueDate = getNextAnchoredDate(startDate, freq!, new Date());
    } else {
      resolvedNextDueDate = nextDueDate ?? new Date().toISOString().split("T")[0];
    }

    const [task] = await db
      .insert(maintenanceTasksTable)
      .values({
        title,
        description: description ?? null,
        propertyId: Number(propertyId),
        category,
        frequencyDays: freq,
        scheduleType: effectiveScheduleType,
        isCompleted: false,
        isCleanerTask: isCleanerTask === true,
        startDate: effectiveScheduleType === "recurring" ? startDate ?? null : null,
        nextDueDate: resolvedNextDueDate,
      })
      .returning();

    const [prop] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, task.propertyId));
    res.status(201).json(formatTask(task, prop?.name ?? ""));
  } catch (err) {
    req.log.error({ err }, "Failed to create maintenance task");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/maintenance-tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, category, frequencyDays, scheduleType, startDate, nextDueDate, isCleanerTask } = req.body;
    const [existing] = await db.select().from(maintenanceTasksTable).where(eq(maintenanceTasksTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const effectiveScheduleType = scheduleType ?? existing.scheduleType;
    if (effectiveScheduleType !== "recurring" && effectiveScheduleType !== "one-time") {
      res.status(400).json({ error: "scheduleType must be recurring or one-time" });
      return;
    }

    const effectiveFrequencyDays = effectiveScheduleType === "recurring"
      ? (frequencyDays !== undefined ? Number(frequencyDays) : existing.frequencyDays)
      : null;
    if (effectiveScheduleType === "recurring" && (!Number.isInteger(effectiveFrequencyDays) || (effectiveFrequencyDays ?? 0) < 1)) {
      res.status(400).json({ error: "A recurring task needs a positive repeat interval" });
      return;
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
        ...(category !== undefined && { category }),
        frequencyDays: effectiveFrequencyDays,
        scheduleType: effectiveScheduleType,
        startDate: effectiveStartDate ?? null,
        ...(resolvedNextDueDate !== undefined && { nextDueDate: resolvedNextDueDate }),
        ...(scheduleType !== undefined && { isCompleted: false }),
        ...(isCleanerTask !== undefined && { isCleanerTask: Boolean(isCleanerTask) }),
      })
      .where(eq(maintenanceTasksTable.id, id));

    const rows = await db
      .select({ task: maintenanceTasksTable, propertyName: propertiesTable.name })
      .from(maintenanceTasksTable)
      .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
      .where(eq(maintenanceTasksTable.id, id));

    if (!rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(formatTask(rows[0].task, rows[0].propertyName ?? ""));
  } catch (err) {
    req.log.error({ err }, "Failed to update maintenance task");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/maintenance-tasks/:id", async (req, res) => {
  try {
    await db.delete(maintenanceTasksTable).where(eq(maintenanceTasksTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete maintenance task");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/maintenance-tasks/:id/complete", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { completedBy } = req.body;

    const [existing] = await db
      .select()
      .from(maintenanceTasksTable)
      .where(eq(maintenanceTasksTable.id, id));

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
        .where(eq(maintenanceTasksTable.id, id));
    } else {
      // If the task has a startDate anchor, keep the recurrence aligned to that
      // schedule rather than drifting from the completion date.
      let nextDueDate: string;
      if (existing.startDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        nextDueDate = getNextAnchoredDate(existing.startDate, existing.frequencyDays!, tomorrow);
      } else {
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + existing.frequencyDays!);
        nextDueDate = nextDue.toISOString().split("T")[0];
      }

      await db
        .update(maintenanceTasksTable)
        .set({
          lastCompletedAt: new Date(),
          lastCompletedBy: completedBy ?? null,
          nextDueDate,
        })
        .where(eq(maintenanceTasksTable.id, id));
    }

    const rows = await db
      .select({ task: maintenanceTasksTable, propertyName: propertiesTable.name })
      .from(maintenanceTasksTable)
      .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
      .where(eq(maintenanceTasksTable.id, id));

    res.json(formatTask(rows[0].task, rows[0].propertyName ?? ""));
  } catch (err) {
    req.log.error({ err }, "Failed to complete maintenance task");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
