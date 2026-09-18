import { Router } from "express";
import { db } from "@workspace/db";
import {
  choresTable,
  maintenanceTasksTable,
  todoItemsTable,
  todoListsTable,
  mealPlansTable,
  propertiesTable,
} from "@workspace/db";
import { eq, and, lt, lte, isNull, ne, or, sql, inArray } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";
import { addMaintenanceDays, dateInMaintenanceTimeZone, resolveMaintenanceTimeZone } from "../lib/maintenanceDates";

const router = Router();

// Meal plan weeks start Monday everywhere (mondayForDate in routes/ai.ts,
// weekStartString in lib/aiLiveContext.ts, mondayOfWeek in Kitchen.tsx).
// This used a Sunday start, so today's meals never matched a stored week.
function mondayOf(dateOnly: string): string {
  const day = new Date(`${dateOnly}T00:00:00Z`).getUTCDay(); // 0=Sun
  return addMaintenanceDays(dateOnly, day === 0 ? -6 : 1 - day);
}

router.get("/dashboard", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const propertyIds = scope.propertyIds;

    // "Today" is the household's local calendar day, not the server's UTC
    // day, which in US time zones rolls over during the evening.
    const timeZone = resolveMaintenanceTimeZone(req.query.timezone);
    if (!timeZone) {
      res.status(400).json({ error: "Invalid timezone" });
      return;
    }
    const todayStr = dateInMaintenanceTimeZone(timeZone);
    const sevenDaysStr = addMaintenanceDays(todayStr, 7);
    const weekStart = mondayOf(todayStr);
    const todayDow = new Date(`${todayStr}T00:00:00Z`).getUTCDay(); // meal plans store 0=Sun

    // If the authorized scope has no properties, return empty/zero aggregates
    // without generating an invalid `IN ()` SQL clause.
    if (propertyIds.length === 0) {
      res.json({
        choresToday: 0,
        choresOverdue: 0,
        maintenanceDueSoon: 0,
        maintenanceOverdue: 0,
        activeTodoItems: 0,
        todaysMeals: [],
        upcomingMaintenance: [],
      });
      return;
    }

    const choreScope = inArray(choresTable.propertyId, propertyIds);
    const maintenanceScope = inArray(maintenanceTasksTable.propertyId, propertyIds);
    const mealScope = inArray(mealPlansTable.propertyId, propertyIds);

    // Chores due today (dueDate = today and not completed)
    const [{ choresToday }] = await db
      .select({ choresToday: sql<number>`count(*)::int` })
      .from(choresTable)
      .where(
        and(
          choreScope,
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
          choreScope,
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
      .where(and(maintenanceScope, lt(maintenanceTasksTable.nextDueDate, todayStr), activeMaintenance));

    // Maintenance due within 7 days
    const [{ maintenanceDueSoon }] = await db
      .select({ maintenanceDueSoon: sql<number>`count(*)::int` })
      .from(maintenanceTasksTable)
      .where(
        and(
          maintenanceScope,
          lte(maintenanceTasksTable.nextDueDate, sevenDaysStr),
          sql`${maintenanceTasksTable.nextDueDate} >= ${todayStr}`,
          activeMaintenance,
        ),
      );

    // Active todo items (incomplete), scoped to the household via todo_lists
    const [{ activeTodoItems }] = await db
      .select({ activeTodoItems: sql<number>`count(*)::int` })
      .from(todoItemsTable)
      .innerJoin(todoListsTable, eq(todoItemsTable.listId, todoListsTable.id))
      .where(
        and(
          eq(todoListsTable.householdId, scope.householdId),
          eq(todoItemsTable.completed, false),
        ),
      );

    // Today's meals
    const todaysMeals = await db
      .select()
      .from(mealPlansTable)
      .where(
        and(
          mealScope,
          eq(mealPlansTable.weekStart, weekStart),
          eq(mealPlansTable.dayOfWeek, todayDow),
        ),
      )
      .orderBy(mealPlansTable.mealType);

    // Upcoming maintenance (next 30 days, sorted by date)
    const thirtyDaysStr = addMaintenanceDays(todayStr, 30);

    const upcomingRows = await db
      .select({ task: maintenanceTasksTable, propertyName: propertiesTable.name })
      .from(maintenanceTasksTable)
      .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
      .where(and(maintenanceScope, lte(maintenanceTasksTable.nextDueDate, thirtyDaysStr), activeMaintenance))
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
