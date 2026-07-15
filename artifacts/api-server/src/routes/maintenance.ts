import { Router } from "express";
import { db } from "@workspace/db";
import { maintenanceTasksTable, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
    frequencyDays: task.frequencyDays,
    isCleanerTask: task.isCleanerTask,
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

    let filtered = rows;
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
    const { title, description, propertyId, category, frequencyDays, nextDueDate, isCleanerTask } = req.body;
    if (!title || !propertyId || !category || !frequencyDays || !nextDueDate) {
      return res.status(400).json({ error: "title, propertyId, category, frequencyDays, nextDueDate required" });
    }

    const [task] = await db
      .insert(maintenanceTasksTable)
      .values({
        title,
        description: description ?? null,
        propertyId: Number(propertyId),
        category,
        frequencyDays: Number(frequencyDays),
        isCleanerTask: isCleanerTask === true,
        nextDueDate,
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
    const { title, description, category, frequencyDays, nextDueDate, isCleanerTask } = req.body;

    await db
      .update(maintenanceTasksTable)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description ?? null }),
        ...(category !== undefined && { category }),
        ...(frequencyDays !== undefined && { frequencyDays: Number(frequencyDays) }),
        ...(nextDueDate !== undefined && { nextDueDate }),
        ...(isCleanerTask !== undefined && { isCleanerTask: Boolean(isCleanerTask) }),
      })
      .where(eq(maintenanceTasksTable.id, id));

    const rows = await db
      .select({ task: maintenanceTasksTable, propertyName: propertiesTable.name })
      .from(maintenanceTasksTable)
      .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
      .where(eq(maintenanceTasksTable.id, id));

    if (!rows.length) return res.status(404).json({ error: "Not found" });
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

    if (!existing) return res.status(404).json({ error: "Not found" });

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + existing.frequencyDays);
    const nextDueDate = nextDue.toISOString().split("T")[0];

    await db
      .update(maintenanceTasksTable)
      .set({
        lastCompletedAt: new Date(),
        lastCompletedBy: completedBy ?? null,
        nextDueDate,
      })
      .where(eq(maintenanceTasksTable.id, id));

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
