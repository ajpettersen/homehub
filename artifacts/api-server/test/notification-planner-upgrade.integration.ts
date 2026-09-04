import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import {
  choresTable,
  familyMembersTable,
  householdNotificationPreferencesTable,
  householdsTable,
  notificationDeliveryTable,
  propertiesTable,
  pushTokensTable,
  todoItemsTable,
  todoListsTable,
  userProfilesTable,
  webPushSubscriptionsTable,
  workoutParticipantsTable,
  workoutsTable,
  workoutPreferencesTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  buildDueNotificationMessages,
  buildDueWebPushMessages,
} from "../src/notificationPlanner";

const suffix = crypto.randomUUID().replaceAll("-", "");
const chicagoToken = `ExponentPushToken[${suffix.slice(0, 24)}]`;
const otherToken = `ExponentPushToken[${suffix.slice(8, 32)}]`;
const utcToken = `ExponentPushToken[${suffix.slice(4, 28)}]`;
const cleanerToken = `ExponentPushToken[${suffix.slice(2, 26)}]`;
const householdIds: number[] = [];
const workoutIds: number[] = [];

try {
  const [chicago, utc] = await db.insert(householdsTable).values([
    { name: `Chicago planner ${suffix}` },
    { name: `UTC planner ${suffix}` },
  ]).returning();
  householdIds.push(chicago.id, utc.id);
  const [chicagoProperty, utcProperty] = await db.insert(propertiesTable).values([
    { householdId: chicago.id, name: "Chicago", type: "house" },
    { householdId: utc.id, name: "UTC", type: "house" },
  ]).returning();
  const [adult, otherAdult, utcAdult] = await db.insert(familyMembersTable).values([
    { householdId: chicago.id, name: "Planner adult", role: "parent", color: "#111111", avatarInitials: "PA" },
    { householdId: chicago.id, name: "Other adult", role: "parent", color: "#222222", avatarInitials: "OA" },
    { householdId: utc.id, name: "UTC adult", role: "parent", color: "#333333", avatarInitials: "UA" },
  ]).returning();
  const adultClerkId = `planner-adult-${suffix}`;
  const otherClerkId = `planner-other-${suffix}`;
  await db.insert(userProfilesTable).values([
    {
      clerkId: adultClerkId,
      householdId: chicago.id,
      role: "family",
      linkedFamilyMemberId: adult.id,
    },
    { clerkId: otherClerkId, householdId: chicago.id, role: "family", linkedFamilyMemberId: otherAdult.id },
    { clerkId: `planner-utc-${suffix}`, householdId: utc.id, role: "family", linkedFamilyMemberId: utcAdult.id },
    { clerkId: `planner-cleaner-${suffix}`, householdId: chicago.id, role: "cleaner" },
  ]);
  await db.insert(pushTokensTable).values([
    { householdId: chicago.id, clerkId: adultClerkId, token: chicagoToken },
    { householdId: chicago.id, clerkId: otherClerkId, token: otherToken },
    { householdId: chicago.id, clerkId: `planner-cleaner-${suffix}`, token: cleanerToken },
    { householdId: utc.id, clerkId: `planner-utc-${suffix}`, token: utcToken },
  ]);
  await db.insert(webPushSubscriptionsTable).values({
    householdId: chicago.id,
    clerkId: adultClerkId,
    endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
    keys: { p256dh: "planner-test", auth: "planner-test" },
  });
  await db.insert(householdNotificationPreferencesTable).values({
    householdId: chicago.id,
    timezone: "America/Chicago",
    dueReminderTime: "08:00",
    workoutFollowUpTime: "08:00",
  });
  await db.insert(workoutPreferencesTable).values({
    householdId: chicago.id,
    timezone: "America/Chicago",
  });
  await db.insert(householdNotificationPreferencesTable).values({
    householdId: utc.id,
    timezone: "UTC",
    dueReminderTime: "05:00",
    workoutFollowUpTime: "20:55",
  });
  await assert.rejects(
    db.update(householdNotificationPreferencesTable)
      .set({ dueReminderTime: "04:59" })
      .where(eq(householdNotificationPreferencesTable.householdId, utc.id)),
    "times before 05:00 must be rejected",
  );
  await assert.rejects(
    db.update(householdNotificationPreferencesTable)
      .set({ workoutFollowUpTime: "20:56" })
      .where(eq(householdNotificationPreferencesTable.householdId, utc.id)),
    "times after 20:55 must be rejected",
  );
  await db.update(householdNotificationPreferencesTable)
    .set({ dueReminderTime: "08:00", workoutFollowUpTime: "08:00" })
    .where(eq(householdNotificationPreferencesTable.householdId, utc.id));

  await db.insert(choresTable).values([
    {
      title: "Chicago boundary chore",
      assigneeId: adult.id,
      propertyId: chicagoProperty.id,
      frequency: "once",
      dueDate: "2026-01-02",
    },
    {
      title: "UTC boundary chore",
      assigneeId: utcAdult.id,
      propertyId: utcProperty.id,
      frequency: "once",
      dueDate: "2026-01-02",
    },
  ]);
  const [list] = await db.insert(todoListsTable).values({
    householdId: chicago.id,
    name: "Assigned reminders",
    assigneeId: adult.id,
  }).returning();
  await db.insert(todoItemsTable).values({
    listId: list.id,
    content: "Private assigned task",
    dueDate: "2026-01-02",
  });
  const [workout] = await db.insert(workoutsTable).values({
    memberId: adult.id,
    title: "Private workout title",
    workoutDate: "2026-01-01",
    scheduledDate: "2026-01-01",
    sessionStatus: "scheduled",
    sessionKind: "weekly_plan",
  }).returning();
  workoutIds.push(workout.id);
  await db.insert(workoutParticipantsTable).values({
    workoutId: workout.id,
    memberId: adult.id,
  });

  const before = await buildDueNotificationMessages(
    new Date("2026-01-02T13:59:00Z"),
  );
  assert.equal(
    before.filter((message) => message.delivery.householdId === chicago.id).length,
    0,
    "Chicago reminders must wait for 08:00 local",
  );
  const after = await buildDueNotificationMessages(
    new Date("2026-01-02T14:01:00Z"),
  );
  const chicagoAfter = after.filter(
    (message) => message.delivery.householdId === chicago.id,
  );
  assert(chicagoAfter.length > 0, "Chicago reminders should run after 08:00 local");
  const assignedTodo = chicagoAfter.filter(
    (message) => message.delivery.kind === "todo",
  );
  assert.deepEqual(
    assignedTodo.map((message) => message.to),
    [chicagoToken],
    "an assigned todo should target only the linked adult",
  );
  assert(
    !chicagoAfter.some((message) => message.to === cleanerToken),
    "cleaner Expo tokens must never receive household reminders",
  );

  const utcBefore = await buildDueNotificationMessages(
    new Date("2026-01-02T07:59:00Z"),
  );
  const utcAfter = await buildDueNotificationMessages(
    new Date("2026-01-02T08:01:00Z"),
  );
  assert.equal(
    utcBefore.filter((message) => message.delivery.householdId === utc.id).length,
    0,
  );
  assert(
    utcAfter.some((message) => message.delivery.householdId === utc.id),
    "the default UTC household should cross its boundary earlier than Chicago",
  );

  const webAfter = await buildDueWebPushMessages(
    new Date("2026-01-02T14:01:00Z"),
  );
  assert(
    chicagoAfter.some((message) => message.delivery.kind === "workout-follow-up"),
    "Expo should include next-morning workout follow-ups",
  );
  assert.deepEqual(
    chicagoAfter
      .filter((message) => message.delivery.kind === "workout-follow-up")
      .map((message) => message.to),
    [chicagoToken],
    "a participant target must not broaden to another linked adult",
  );
  assert(
    webAfter.some(
      (message) =>
        message.delivery.householdId === chicago.id &&
        message.delivery.kind === "workout-follow-up",
    ),
    "Web Push should include the same workout follow-up",
  );

  const nextDay = await buildDueNotificationMessages(
    new Date("2026-01-03T14:01:00Z"),
  );
  const overdue = nextDay.find(
    (message) =>
      message.delivery.householdId === chicago.id &&
      message.delivery.kind === "chore",
  );
  assert(overdue?.delivery.dedupeKey.endsWith(":2026-01-03"));

  const delivery = chicagoAfter[0].delivery;
  await db.insert(notificationDeliveryTable).values(delivery).onConflictDoNothing();
  await db.insert(notificationDeliveryTable).values(delivery).onConflictDoNothing();
  const persisted = await db.select({ id: notificationDeliveryTable.id })
    .from(notificationDeliveryTable)
    .where(eq(notificationDeliveryTable.dedupeKey, delivery.dedupeKey));
  assert.equal(persisted.length, 1, "persistent dedupe must survive planner restarts");

  await db.delete(householdNotificationPreferencesTable)
    .where(eq(householdNotificationPreferencesTable.householdId, chicago.id));
  const legacyTimezoneBefore = await buildDueNotificationMessages(
    new Date("2026-01-02T13:59:00Z"),
  );
  assert.equal(
    legacyTimezoneBefore.filter((message) => message.delivery.householdId === chicago.id).length,
    0,
    "a missing notification preference must retain the legacy workout timezone",
  );

  console.log("Notification planner timezone and targeting test passed");
} finally {
  if (workoutIds.length > 0) {
    await db.delete(workoutsTable).where(inArray(workoutsTable.id, workoutIds));
  }
  if (householdIds.length > 0) {
    await db.delete(householdsTable).where(inArray(householdsTable.id, householdIds));
  }
  await pool.end();
}