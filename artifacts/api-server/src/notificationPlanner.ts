import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db } from "@workspace/db";
import {
  choresTable,
  maintenanceTasksTable,
  propertiesTable,
  pushTokensTable,
  webPushSubscriptionsTable,
  userProfilesTable,
  workoutParticipantsTable,
  workoutPreferencesTable,
  workoutsTable,
  familyMembersTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";

function dateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function daysFrom(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return dateString(result);
}

export async function buildDueNotificationMessages(
  now = new Date(),
  sentKeys: Set<string> = new Set(),
): Promise<ExpoPushMessage[]> {
  const tokenRows = await db
    .select({
      token: pushTokensTable.token,
      householdId: pushTokensTable.householdId,
    })
    .from(pushTokensTable);

  const tokensByHousehold = new Map<number, string[]>();
  for (const row of tokenRows) {
    if (row.householdId === null || !Expo.isExpoPushToken(row.token)) continue;
    const tokens = tokensByHousehold.get(row.householdId) ?? [];
    tokens.push(row.token);
    tokensByHousehold.set(row.householdId, tokens);
  }

  const householdIds = [...tokensByHousehold.keys()];
  if (householdIds.length === 0) return [];

  const today = dateString(now);
  const tomorrow = daysFrom(now, 1);
  const twoDaysOut = daysFrom(now, 2);
  const messages: ExpoPushMessage[] = [];

  const dueChores = await db
    .select({
      id: choresTable.id,
      dueDate: choresTable.dueDate,
      householdId: propertiesTable.householdId,
    })
    .from(choresTable)
    .innerJoin(propertiesTable, eq(choresTable.propertyId, propertiesTable.id))
    .where(
      and(
        inArray(propertiesTable.householdId, householdIds),
        lte(choresTable.dueDate, today),
        isNull(choresTable.completedAt),
      ),
    );

  for (const chore of dueChores) {
    if (chore.householdId === null) continue;
    const isOverdue = chore.dueDate !== null && chore.dueDate < today;
    const body = isOverdue
      ? "A household chore is overdue"
      : "A household chore is due today";

    for (const token of tokensByHousehold.get(chore.householdId) ?? []) {
      const key = `${token}:chore:${chore.id}:${today}`;
      if (sentKeys.has(key)) continue;
      sentKeys.add(key);
      messages.push({
        to: token,
        title: "🧹 Chore reminder",
        body,
        data: { type: "chore" },
        sound: "default",
      });
    }
  }

  const activeMaintenance = or(
    ne(maintenanceTasksTable.scheduleType, "one-time"),
    eq(maintenanceTasksTable.isCompleted, false),
  );
  const dueMaintenance = await db
    .select({
      id: maintenanceTasksTable.id,
      nextDueDate: maintenanceTasksTable.nextDueDate,
      householdId: propertiesTable.householdId,
    })
    .from(maintenanceTasksTable)
    .innerJoin(
      propertiesTable,
      eq(maintenanceTasksTable.propertyId, propertiesTable.id),
    )
    .where(
      and(
        inArray(propertiesTable.householdId, householdIds),
        lte(maintenanceTasksTable.nextDueDate, twoDaysOut),
        activeMaintenance,
      ),
    );

  for (const task of dueMaintenance) {
    if (task.householdId === null) continue;
    const when =
      task.nextDueDate === today
        ? "today"
        : task.nextDueDate === tomorrow
          ? "tomorrow"
          : "soon";

    for (const token of tokensByHousehold.get(task.householdId) ?? []) {
      const key = `${token}:maintenance:${task.id}:${today}`;
      if (sentKeys.has(key)) continue;
      sentKeys.add(key);
      messages.push({
        to: token,
        title: "🔧 Maintenance reminder",
        body: `Home maintenance due ${when}`,
        data: { type: "maintenance" },
        sound: "default",
      });
    }
  }

  return messages;
}

export type PlannedWebPush = {
  subscriptionId: number;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  payload: { title: string; body: string; url: string; tag: string };
};

export async function buildDueWebPushMessages(
  now = new Date(),
  sentKeys: Set<string> = new Set(),
): Promise<PlannedWebPush[]> {
  const subscriptions = await db
    .select({
      id: webPushSubscriptionsTable.id,
      endpoint: webPushSubscriptionsTable.endpoint,
      keys: webPushSubscriptionsTable.keys,
      householdId: webPushSubscriptionsTable.householdId,
    })
    .from(webPushSubscriptionsTable)
    .innerJoin(
      userProfilesTable,
      and(
        eq(webPushSubscriptionsTable.clerkId, userProfilesTable.clerkId),
        eq(webPushSubscriptionsTable.householdId, userProfilesTable.householdId),
        eq(userProfilesTable.role, "family"),
      ),
    );
  const subscriptionsByHousehold = new Map<number, typeof subscriptions>();
  for (const subscription of subscriptions) {
    const rows = subscriptionsByHousehold.get(subscription.householdId) ?? [];
    rows.push(subscription);
    subscriptionsByHousehold.set(subscription.householdId, rows);
  }
  const householdIds = [...subscriptionsByHousehold.keys()];
  if (householdIds.length === 0) return [];

  const today = dateString(now);
  const tomorrow = daysFrom(now, 1);
  const twoDaysOut = daysFrom(now, 2);
  const messages: PlannedWebPush[] = [];

  const dueChores = await db
    .select({
      id: choresTable.id,
      dueDate: choresTable.dueDate,
      householdId: propertiesTable.householdId,
    })
    .from(choresTable)
    .innerJoin(propertiesTable, eq(choresTable.propertyId, propertiesTable.id))
    .where(
      and(
        inArray(propertiesTable.householdId, householdIds),
        lte(choresTable.dueDate, today),
        isNull(choresTable.completedAt),
      ),
    );
  for (const chore of dueChores) {
    if (chore.householdId === null) continue;
    const body =
      chore.dueDate !== null && chore.dueDate < today
        ? "A household chore is overdue"
        : "A household chore is due today";
    for (const subscription of subscriptionsByHousehold.get(chore.householdId) ?? []) {
      const key = `web:${subscription.id}:chore:${chore.id}:${today}`;
      if (sentKeys.has(key)) continue;
      sentKeys.add(key);
      messages.push({
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        payload: {
          title: "Chore reminder",
          body,
          url: "/chores",
          tag: `chore-${chore.id}-${today}`,
        },
      });
    }
  }

  const dueMaintenance = await db
    .select({
      id: maintenanceTasksTable.id,
      nextDueDate: maintenanceTasksTable.nextDueDate,
      householdId: propertiesTable.householdId,
    })
    .from(maintenanceTasksTable)
    .innerJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
    .where(
      and(
        inArray(propertiesTable.householdId, householdIds),
        lte(maintenanceTasksTable.nextDueDate, twoDaysOut),
        or(
          ne(maintenanceTasksTable.scheduleType, "one-time"),
          eq(maintenanceTasksTable.isCompleted, false),
        ),
      ),
    );
  for (const task of dueMaintenance) {
    if (task.householdId === null) continue;
    const when =
      task.nextDueDate === today ? "today" : task.nextDueDate === tomorrow ? "tomorrow" : "soon";
    for (const subscription of subscriptionsByHousehold.get(task.householdId) ?? []) {
      const key = `web:${subscription.id}:maintenance:${task.id}:${today}`;
      if (sentKeys.has(key)) continue;
      sentKeys.add(key);
      messages.push({
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        payload: {
          title: "Maintenance reminder",
          body: `Home maintenance due ${when}`,
          url: "/maintenance",
          tag: `maintenance-${task.id}-${today}`,
        },
      });
    }
  }

  // Web-only: the following local day asks the household to confirm a session
  // that was scheduled yesterday and is still unresolved. The key/tag follows
  // the existing per-subscription/day dedupe convention.
  const preferences = await db.select().from(workoutPreferencesTable)
    .where(inArray(workoutPreferencesTable.householdId, householdIds));
  const timezoneByHousehold = new Map(preferences.map(row => [row.householdId, row.timezone]));
  const localDate = (timezone: string, offsetDays = 0) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const value = (type: string) => parts.find(part => part.type === type)?.value;
    const date = new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };
  const unresolved = await db.selectDistinct({
    id: workoutsTable.id,
    title: workoutsTable.title,
    scheduledDate: workoutsTable.scheduledDate,
    householdId: familyMembersTable.householdId,
  }).from(workoutsTable)
    .innerJoin(workoutParticipantsTable, eq(workoutsTable.id, workoutParticipantsTable.workoutId))
    .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
    .where(and(inArray(familyMembersTable.householdId, householdIds), eq(workoutsTable.sessionStatus, "scheduled"), isNull(workoutsTable.followUpDismissedAt)));
  for (const workout of unresolved) {
    const timezone = timezoneByHousehold.get(workout.householdId) ?? "UTC";
    const todayForHousehold = localDate(timezone);
    if (workout.scheduledDate !== localDate(timezone, -1)) continue;
    for (const subscription of subscriptionsByHousehold.get(workout.householdId) ?? []) {
      const key = `web:${subscription.id}:workout-follow-up:${workout.id}:${todayForHousehold}`;
      if (sentKeys.has(key)) continue;
      sentKeys.add(key);
      messages.push({
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        payload: {
          title: "Workout follow-up",
          body: `Did you complete ${workout.title}?`,
          url: "/workouts",
          tag: `workout-follow-up-${workout.id}-${todayForHousehold}`,
        },
      });
    }
  }
  return messages;
}