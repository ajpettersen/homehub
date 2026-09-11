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

// Weeks start Monday everywhere else in the app (see mondayForDate in
// routes/ai.ts and mondayOfWeek in the frontend) — this must agree, or
// mealPlansTable.weekStart lookups silently miss every meal in the week.
// UTC-based so the boundary doesn't shift with the server's local timezone.
function weekStartString(date: Date): string {
  const start = new Date(`${dateString(date)}T00:00:00Z`);
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  return dateString(start);
}

function daysFrom(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return dateString(result);
}

/** Calendar date for a weekStart (YYYY-MM-DD) plus a day-of-week offset, computed in UTC to avoid server-timezone drift. */
function dateForDayOfWeek(weekStart: string, dayOfWeek: number): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + dayOfWeek);
  return start.toISOString().slice(0, 10);
}

export type LiveHouseholdSnapshot = {
  weekStart: string;
  meals: {
    meal: string;
    mealType: string;
    dayOfWeek: number;
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
        dayOfWeek: mealPlansTable.dayOfWeek,
        notes: mealPlansTable.notes,
        propertyName: propertiesTable.name,
      })
      .from(mealPlansTable)
      .innerJoin(propertiesTable, eq(mealPlansTable.propertyId, propertiesTable.id))
      .where(and(
        inArray(mealPlansTable.propertyId, propertyIds),
        eq(mealPlansTable.weekStart, weekStart),
      ))
      .orderBy(mealPlansTable.dayOfWeek, mealPlansTable.mealType),
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

  return { weekStart, meals, maintenance, chores };
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
    ? snapshot.meals.map((meal) => {
      const date = dateForDayOfWeek(snapshot.weekStart, meal.dayOfWeek);
      return `- ${date} ${meal.mealType}: ${meal.meal}${formatProperty(meal.propertyName)}${meal.notes ? ` — ${meal.notes}` : ""}`;
    }).join("\n")
    : "- (no meals planned this week)";
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

  const weekEnd = dateForDayOfWeek(snapshot.weekStart, 6);

  return `\nLive household snapshot (today is ${today}; this reflects the current real data, so trust it over anything said earlier in the conversation):
Meals planned this week (${snapshot.weekStart} through ${weekEnd}):
${mealLines}

Overdue maintenance:
${overdueLines}

Maintenance due in the next 7 days:
${upcomingLines}

Active chores (not completed):
${choreLines}
`;
}