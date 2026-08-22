import { Router } from "express";
import { db } from "@workspace/db";
import {
  choresTable,
  maintenanceTasksTable,
  todoItemsTable,
  mealPlansTable,
  propertiesTable,
} from "@workspace/db";
import { eq, and, lt, lte, isNull, ne, or, sql } from "drizzle-orm";

const router = Router();

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d.toISOString().split("T")[0];
}

router.get("/dashboard", async (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const sevenDays = new Date(today);
    sevenDays.setDate(sevenDays.getDate() + 7);
    const sevenDaysStr = sevenDays.toISOString().split("T")[0];
    const weekStart = getWeekStart(today);
    const todayDow = today.getDay();

    // Chores due today (dueDate = today and not completed)
    const [{ choresToday }] = await db
      .select({ choresToday: sql<number>`count(*)::int` })
      .from(choresTable)
      .where(
        and(
          eq(choresTable.dueDate, todayStr),
          isNull(choresTable.completedAt),
        ),
      );

    // Overdue chores
    const [{ choresOverdue }] = await db
      .select({ choresOverdue: sql<number>`count(*)::int` })
      .from(choresTable)
      .where(
        and(
          lt(choresTable.dueDate, todayStr),
          isNull(choresTable.completedAt),
        ),
      );

    const activeMaintenance = or(
      ne(maintenanceTasksTable.scheduleType, "one-time"),
      eq(maintenanceTasksTable.isCompleted, false),
    );

    // Maintenance overdue
    const [{ maintenanceOverdue }] = await db
      .select({ maintenanceOverdue: sql<number>`count(*)::int` })
      .from(maintenanceTasksTable)
      .where(and(lt(maintenanceTasksTable.nextDueDate, todayStr), activeMaintenance));

    // Maintenance due within 7 days
    const [{ maintenanceDueSoon }] = await db
      .select({ maintenanceDueSoon: sql<number>`count(*)::int` })
      .from(maintenanceTasksTable)
      .where(
        and(
          lte(maintenanceTasksTable.nextDueDate, sevenDaysStr),
          sql`${maintenanceTasksTable.nextDueDate} >= ${todayStr}`,
          activeMaintenance,
        ),
      );

    // Active todo items (incomplete)
    const [{ activeTodoItems }] = await db
      .select({ activeTodoItems: sql<number>`count(*)::int` })
      .from(todoItemsTable)
      .where(eq(todoItemsTable.completed, false));

    // Today's meals
    const todaysMeals = await db
      .select()
      .from(mealPlansTable)
      .where(
        and(
          eq(mealPlansTable.weekStart, weekStart),
          eq(mealPlansTable.dayOfWeek, todayDow),
        ),
      )
      .orderBy(mealPlansTable.mealType);

    // Upcoming maintenance (next 30 days, sorted by date)
    const thirtyDays = new Date(today);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const thirtyDaysStr = thirtyDays.toISOString().split("T")[0];

    const upcomingRows = await db
      .select({ task: maintenanceTasksTable, propertyName: propertiesTable.name })
      .from(maintenanceTasksTable)
      .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
      .where(and(lte(maintenanceTasksTable.nextDueDate, thirtyDaysStr), activeMaintenance))
      .orderBy(maintenanceTasksTable.nextDueDate)
      .limit(8);

    res.json({
      choresToday,
      choresOverdue,
      maintenanceDueSoon,
      maintenanceOverdue,
      activeTodoItems,
      todaysMeals: todaysMeals.map((m) => ({
        id: String(m.id),
        weekStart: m.weekStart,
        dayOfWeek: m.dayOfWeek,
        mealType: m.mealType,
        meal: m.meal,
        notes: m.notes ?? null,
        propertyId: String(m.propertyId),
      })),
      upcomingMaintenance: upcomingRows.map((r) => {
        const isOverdue = r.task.nextDueDate < todayStr;
        const isDueSoon = !isOverdue && r.task.nextDueDate <= sevenDaysStr;
        return {
          id: String(r.task.id),
          title: r.task.title,
          description: r.task.description ?? null,
          propertyId: String(r.task.propertyId),
          propertyName: r.propertyName ?? "",
          category: r.task.category,
          frequencyDays: r.task.frequencyDays ?? null,
          scheduleType: r.task.scheduleType,
          isCompleted: r.task.isCompleted,
          isCleanerTask: r.task.isCleanerTask,
          startDate: r.task.startDate ?? null,
          lastCompletedAt: r.task.lastCompletedAt?.toISOString() ?? null,
          lastCompletedBy: r.task.lastCompletedBy ?? null,
          nextDueDate: r.task.nextDueDate,
          isOverdue,
          isDueSoon,
        };
      }),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
