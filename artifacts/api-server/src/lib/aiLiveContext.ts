import { db } from "@workspace/db";
import {
  choresTable,
  familyMembersTable,
  maintenanceTasksTable,
  mealPlansTable,
  propertiesTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";

function dateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function weekStartString(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return dateString(start);
}

function daysFrom(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return dateString(result);
}

export type LiveHouseholdSnapshot = {
  meals: {
    meal: string;
    mealType: string;
    notes: string | null;
    propertyName: string;
  }[];
  maintenance: {
    title: string;
    category: string;
    nextDueDate: string;
    propertyName: string;
  }[];
  chores: {
    title: string;
    dueDate: string | null;
    assigneeName: string | null;
    propertyName: string;
  }[];
};

/**
 * Load the small set of live household data that makes chat useful today.
 * Every query is scoped through the caller's authorized property ids.
 */
export async function getLiveHouseholdSnapshot(
  propertyIds: number[],
  now = new Date(),
): Promise<LiveHouseholdSnapshot> {
  const today = dateString(now);
  const weekStart = weekStartString(now);
  const todayDayOfWeek = now.getDay();
  const sevenDaysOut = daysFrom(now, 7);
  const activeMaintenance = or(
    ne(maintenanceTasksTable.scheduleType, "one-time"),
    eq(maintenanceTasksTable.isCompleted, false),
  );

  const [meals, maintenance, chores] = await Promise.all([
    db
      .select({
        meal: mealPlansTable.meal,
        mealType: mealPlansTable.mealType,
        notes: mealPlansTable.notes,
        propertyName: propertiesTable.name,
      })
      .from(mealPlansTable)
      .innerJoin(propertiesTable, eq(mealPlansTable.propertyId, propertiesTable.id))
      .where(and(
        inArray(mealPlansTable.propertyId, propertyIds),
        eq(mealPlansTable.weekStart, weekStart),
        eq(mealPlansTable.dayOfWeek, todayDayOfWeek),
      ))
      .orderBy(mealPlansTable.mealType),
    db
      .select({
        title: maintenanceTasksTable.title,
        category: maintenanceTasksTable.category,
        nextDueDate: maintenanceTasksTable.nextDueDate,
        propertyName: propertiesTable.name,
      })
      .from(maintenanceTasksTable)
      .innerJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
      .where(and(
        inArray(maintenanceTasksTable.propertyId, propertyIds),
        lte(maintenanceTasksTable.nextDueDate, sevenDaysOut),
        activeMaintenance,
      ))
      .orderBy(maintenanceTasksTable.nextDueDate),
    db
      .select({
        title: choresTable.title,
        dueDate: choresTable.dueDate,
        assigneeName: familyMembersTable.name,
        propertyName: propertiesTable.name,
      })
      .from(choresTable)
      .innerJoin(propertiesTable, eq(choresTable.propertyId, propertiesTable.id))
      .leftJoin(familyMembersTable, and(
        eq(choresTable.assigneeId, familyMembersTable.id),
        eq(familyMembersTable.householdId, propertiesTable.householdId),
      ))
      .where(and(
        inArray(choresTable.propertyId, propertyIds),
        isNull(choresTable.completedAt),
      ))
      .orderBy(choresTable.dueDate, choresTable.id),
  ]);

  return { meals, maintenance, chores };
}

export function formatLiveSnapshot(
  snapshot: LiveHouseholdSnapshot,
  now = new Date(),
): string {
  const today = dateString(now);
  const overdueMaintenance = snapshot.maintenance.filter((task) => task.nextDueDate < today);
  const upcomingMaintenance = snapshot.maintenance.filter((task) => task.nextDueDate >= today);
  const formatProperty = (propertyName: string) => ` [${propertyName}]`;

  const mealLines = snapshot.meals.length > 0
    ? snapshot.meals.map((meal) =>
      `- ${meal.mealType}: ${meal.meal}${formatProperty(meal.propertyName)}${meal.notes ? ` — ${meal.notes}` : ""}`,
    ).join("\n")
    : "- (no meals planned for today)";
  const overdueLines = overdueMaintenance.length > 0
    ? overdueMaintenance.map((task) =>
      `- ${task.title}${formatProperty(task.propertyName)} — due ${task.nextDueDate} (${task.category})`,
    ).join("\n")
    : "- (none)";
  const upcomingLines = upcomingMaintenance.length > 0
    ? upcomingMaintenance.map((task) =>
      `- ${task.title}${formatProperty(task.propertyName)} — due ${task.nextDueDate} (${task.category})`,
    ).join("\n")
    : "- (none)";
  const choreLines = snapshot.chores.length > 0
    ? snapshot.chores.map((chore) => {
      const assignee = chore.assigneeName ? ` — assigned to ${chore.assigneeName}` : "";
      const due = chore.dueDate ? ` — due ${chore.dueDate}` : "";
      return `- ${chore.title}${formatProperty(chore.propertyName)}${assignee}${due}`;
    }).join("\n")
    : "- (none)";

  return `\nToday's snapshot (live household data; today is ${today}):
Meals planned for today:
${mealLines}

Overdue maintenance:
${overdueLines}

Maintenance due in the next 7 days:
${upcomingLines}

Active chores (not completed):
${choreLines}
`;
}