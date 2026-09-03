import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db } from "@workspace/db";
import {
  choresTable,
  maintenanceTasksTable,
  propertiesTable,
  pushTokensTable,
  webPushSubscriptionsTable,
  userProfilesTable,
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
          url: "/home-hub-web/chores",
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
          url: "/home-hub-web/maintenance",
          tag: `maintenance-${task.id}-${today}`,
        },
      });
    }
  }
  return messages;
}