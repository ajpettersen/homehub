import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db } from "@workspace/db";
import {
  choresTable,
  familyMembersTable,
  householdNotificationPreferencesTable,
  maintenanceTasksTable,
  propertiesTable,
  pushTokensTable,
  todoItemsTable,
  todoListsTable,
  userProfilesTable,
  webPushSubscriptionsTable,
  workoutPreferencesTable,
  workoutParticipantsTable,
  workoutsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

const EVENING_CUTOFF = "21:00";

export type DeliveryDescriptor = {
  dedupeKey: string;
  householdId: number;
  recipient: string;
  channel: "expo" | "web";
  kind: "chore" | "maintenance" | "todo" | "workout-follow-up";
  entityId: number;
  localDate: string;
};

export type PlannedExpoPush = ExpoPushMessage & {
  readonly delivery: DeliveryDescriptor;
};

export type PlannedWebPush = {
  subscriptionId: number;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  payload: { title: string; body: string; url: string; tag: string };
  delivery: DeliveryDescriptor;
};

type Recipient = {
  id: number;
  householdId: number;
  clerkId: string | null;
  linkedFamilyMemberId: number | null;
  channel: "expo" | "web";
  token?: string;
  endpoint?: string;
  keys?: { p256dh: string; auth: string };
};

type Event = {
  householdId: number;
  kind: DeliveryDescriptor["kind"];
  entityId: number;
  localDate: string;
  title: string;
  body: string;
  url: string;
  targetMemberIds?: Set<number>;
};

type LocalClock = { date: string; time: string };

function localClock(now: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function addLocalDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function safeLocalClock(now: Date, timezone: string): LocalClock {
  try {
    return localClock(now, timezone);
  } catch {
    return localClock(now, "UTC");
  }
}

async function loadRecipients(channel: "expo" | "web"): Promise<Recipient[]> {
  if (channel === "expo") {
    const rows = await db.select({
      id: pushTokensTable.id,
      householdId: pushTokensTable.householdId,
      clerkId: pushTokensTable.clerkId,
      token: pushTokensTable.token,
      linkedFamilyMemberId: userProfilesTable.linkedFamilyMemberId,
    }).from(pushTokensTable).innerJoin(
      userProfilesTable,
      and(
        eq(pushTokensTable.clerkId, userProfilesTable.clerkId),
        eq(pushTokensTable.householdId, userProfilesTable.householdId),
        eq(userProfilesTable.role, "family"),
        isNotNull(userProfilesTable.linkedFamilyMemberId),
      ),
    );
    return rows.filter(
      (row): row is typeof row & { householdId: number } =>
        row.householdId !== null && Expo.isExpoPushToken(row.token),
    ).map((row) => ({
      id: row.id,
      householdId: row.householdId,
      clerkId: row.clerkId,
      linkedFamilyMemberId: row.linkedFamilyMemberId,
      channel,
      token: row.token,
    }));
  }

  const rows = await db.select({
    id: webPushSubscriptionsTable.id,
    householdId: webPushSubscriptionsTable.householdId,
    clerkId: webPushSubscriptionsTable.clerkId,
    linkedFamilyMemberId: userProfilesTable.linkedFamilyMemberId,
    endpoint: webPushSubscriptionsTable.endpoint,
    keys: webPushSubscriptionsTable.keys,
  }).from(webPushSubscriptionsTable).innerJoin(
    userProfilesTable,
    and(
      eq(webPushSubscriptionsTable.clerkId, userProfilesTable.clerkId),
      eq(webPushSubscriptionsTable.householdId, userProfilesTable.householdId),
      eq(userProfilesTable.role, "family"),
      isNotNull(userProfilesTable.linkedFamilyMemberId),
    ),
  );
  return rows.map((row) => ({ ...row, channel: "web" as const }));
}

async function loadEvents(
  now: Date,
  householdIds: number[],
): Promise<Event[]> {
  const preferenceRows = await db.select().from(householdNotificationPreferencesTable)
    .where(inArray(householdNotificationPreferencesTable.householdId, householdIds));
  const legacyPreferenceRows = await db.select({
    householdId: workoutPreferencesTable.householdId,
    timezone: workoutPreferencesTable.timezone,
  }).from(workoutPreferencesTable)
    .where(inArray(workoutPreferencesTable.householdId, householdIds));
  const preferences = new Map(preferenceRows.map((row) => [row.householdId, row]));
  const legacyTimezones = new Map(
    legacyPreferenceRows.map((row) => [row.householdId, row.timezone]),
  );
  const clocks = new Map(householdIds.map((householdId) => {
    const preference = preferences.get(householdId);
    return [householdId, safeLocalClock(
      now,
      preference?.timezone ?? legacyTimezones.get(householdId) ?? "UTC",
    )] as const;
  }));
  const dueHouseholds = householdIds.filter((householdId) => {
    const clock = clocks.get(householdId)!;
    const time = preferences.get(householdId)?.dueReminderTime ?? "08:00";
    return clock.time >= time && clock.time < EVENING_CUTOFF;
  });
  const workoutHouseholds = householdIds.filter((householdId) => {
    const clock = clocks.get(householdId)!;
    const time = preferences.get(householdId)?.workoutFollowUpTime ?? "08:00";
    return clock.time >= time && clock.time < EVENING_CUTOFF;
  });
  const events: Event[] = [];

  if (dueHouseholds.length > 0) {
    const maxDate = [...dueHouseholds]
      .map((id) => clocks.get(id)!.date)
      .sort()
      .at(-1)!;
    const chores = await db.select({
      id: choresTable.id,
      dueDate: choresTable.dueDate,
      assigneeId: choresTable.assigneeId,
      householdId: propertiesTable.householdId,
    }).from(choresTable).innerJoin(
      propertiesTable,
      eq(choresTable.propertyId, propertiesTable.id),
    ).where(and(
      inArray(propertiesTable.householdId, dueHouseholds),
      lte(choresTable.dueDate, maxDate),
      isNull(choresTable.completedAt),
    ));
    for (const chore of chores) {
      if (chore.householdId === null || !chore.dueDate) continue;
      const today = clocks.get(chore.householdId)!.date;
      if (chore.dueDate > today) continue;
      events.push({
        householdId: chore.householdId,
        kind: "chore",
        entityId: chore.id,
        localDate: today,
        title: "Chore reminder",
        body: chore.dueDate < today
          ? "A household chore is overdue"
          : "A household chore is due today",
        url: "/chores",
        targetMemberIds: chore.assigneeId === null
          ? undefined
          : new Set([chore.assigneeId]),
      });
    }

    const maintenance = await db.select({
      id: maintenanceTasksTable.id,
      nextDueDate: maintenanceTasksTable.nextDueDate,
      assigneeId: maintenanceTasksTable.assigneeId,
      householdId: propertiesTable.householdId,
    }).from(maintenanceTasksTable).innerJoin(
      propertiesTable,
      eq(maintenanceTasksTable.propertyId, propertiesTable.id),
    ).where(and(
      inArray(propertiesTable.householdId, dueHouseholds),
      lte(maintenanceTasksTable.nextDueDate, maxDate),
      or(
        ne(maintenanceTasksTable.scheduleType, "one-time"),
        eq(maintenanceTasksTable.isCompleted, false),
      ),
    ));
    for (const task of maintenance) {
      if (task.householdId === null) continue;
      const today = clocks.get(task.householdId)!.date;
      if (task.nextDueDate > today) continue;
      events.push({
        householdId: task.householdId,
        kind: "maintenance",
        entityId: task.id,
        localDate: today,
        title: "Maintenance reminder",
        body: task.nextDueDate < today
          ? "Home maintenance is overdue"
          : "Home maintenance is due today",
        url: "/tasks?view=maintenance",
        targetMemberIds: task.assigneeId === null
          ? undefined
          : new Set([task.assigneeId]),
      });
    }

    const todos = await db.select({
      id: todoItemsTable.id,
      dueDate: todoItemsTable.dueDate,
      itemAssigneeId: todoItemsTable.assigneeId,
      listAssigneeId: todoListsTable.assigneeId,
      householdId: todoListsTable.householdId,
    }).from(todoItemsTable).innerJoin(
      todoListsTable,
      eq(todoItemsTable.listId, todoListsTable.id),
    ).leftJoin(
      propertiesTable,
      eq(todoListsTable.propertyId, propertiesTable.id),
    ).where(and(
      inArray(todoListsTable.householdId, dueHouseholds),
      eq(todoItemsTable.completed, false),
      lte(todoItemsTable.dueDate, maxDate),
      or(
        isNull(todoListsTable.propertyId),
        eq(propertiesTable.householdId, todoListsTable.householdId),
      ),
    ));
    for (const todo of todos) {
      if (!todo.dueDate) continue;
      const today = clocks.get(todo.householdId)!.date;
      if (todo.dueDate > today) continue;
      const assigneeId = todo.itemAssigneeId ?? todo.listAssigneeId;
      events.push({
        householdId: todo.householdId,
        kind: "todo",
        entityId: todo.id,
        localDate: today,
        title: "Task reminder",
        body: todo.dueDate < today ? "A household task is overdue" : "A household task is due today",
        url: "/tasks",
        targetMemberIds: assigneeId === null ? undefined : new Set([assigneeId]),
      });
    }
  }

  if (workoutHouseholds.length > 0) {
    const workouts = await db.select({
      id: workoutsTable.id,
      title: workoutsTable.title,
      scheduledDate: workoutsTable.scheduledDate,
      householdId: familyMembersTable.householdId,
      memberId: workoutParticipantsTable.memberId,
    }).from(workoutsTable).innerJoin(
      workoutParticipantsTable,
      eq(workoutsTable.id, workoutParticipantsTable.workoutId),
    ).innerJoin(
      familyMembersTable,
      and(
        eq(workoutParticipantsTable.memberId, familyMembersTable.id),
        inArray(familyMembersTable.householdId, workoutHouseholds),
      ),
    ).where(and(
      eq(workoutsTable.sessionStatus, "scheduled"),
      isNull(workoutsTable.followUpDismissedAt),
    ));
    const grouped = new Map<string, typeof workouts>();
    for (const workout of workouts) {
      const rows = grouped.get(`${workout.householdId}:${workout.id}`) ?? [];
      rows.push(workout);
      grouped.set(`${workout.householdId}:${workout.id}`, rows);
    }
    for (const rows of grouped.values()) {
      const workout = rows[0];
      const today = clocks.get(workout.householdId)!.date;
      if (!workout.scheduledDate || addLocalDays(workout.scheduledDate, 1) !== today) continue;
      events.push({
        householdId: workout.householdId,
        kind: "workout-follow-up",
        entityId: workout.id,
        localDate: today,
        title: "Workout follow-up",
        body: "Did you complete yesterday's scheduled workout?",
        url: "/workouts",
        targetMemberIds: new Set(rows.map((row) => row.memberId)),
      });
    }
  }
  return events;
}

async function buildPlans(
  channel: "expo" | "web",
  now: Date,
  sentKeys: Set<string>,
): Promise<Array<PlannedExpoPush | PlannedWebPush>> {
  const recipients = await loadRecipients(channel);
  if (recipients.length === 0) return [];
  const householdIds = [...new Set(recipients.map((recipient) => recipient.householdId))];
  const events = await loadEvents(now, householdIds);
  const plans: Array<PlannedExpoPush | PlannedWebPush> = [];
  for (const event of events) {
    const householdRecipients = recipients.filter(
      (recipient) => recipient.householdId === event.householdId,
    );
    const targeted = event.targetMemberIds
      ? householdRecipients.filter(
          (recipient) =>
            recipient.linkedFamilyMemberId !== null &&
            event.targetMemberIds!.has(recipient.linkedFamilyMemberId),
        )
      : [];
    const selected = event.targetMemberIds ? targeted : householdRecipients;
    for (const recipient of selected) {
      const dedupeKey =
        `${channel}:${recipient.id}:${event.kind}:${event.entityId}:${event.localDate}`;
      if (sentKeys.has(dedupeKey)) continue;
      sentKeys.add(dedupeKey);
      const delivery: DeliveryDescriptor = {
        dedupeKey,
        householdId: event.householdId,
        recipient: `${channel}:${recipient.id}`,
        channel,
        kind: event.kind,
        entityId: event.entityId,
        localDate: event.localDate,
      };
      if (channel === "expo") {
        const message = {
          to: recipient.token!,
          title: event.title,
          body: event.body,
          data: { type: event.kind },
          sound: "default",
        } as unknown as PlannedExpoPush;
        Object.defineProperty(message, "delivery", { value: delivery, enumerable: false });
        plans.push(message);
      } else {
        plans.push({
          subscriptionId: recipient.id,
          endpoint: recipient.endpoint!,
          keys: recipient.keys!,
          payload: {
            title: event.title,
            body: event.body,
            url: event.url,
            tag: `${event.kind}-${event.entityId}-${event.localDate}`,
          },
          delivery,
        });
      }
    }
  }
  return plans;
}

export async function buildDueNotificationMessages(
  now = new Date(),
  sentKeys: Set<string> = new Set(),
): Promise<PlannedExpoPush[]> {
  return buildPlans("expo", now, sentKeys) as Promise<PlannedExpoPush[]>;
}

export async function buildDueWebPushMessages(
  now = new Date(),
  sentKeys: Set<string> = new Set(),
): Promise<PlannedWebPush[]> {
  return buildPlans("web", now, sentKeys) as Promise<PlannedWebPush[]>;
}