import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import {
  choresTable,
  familyMembersTable,
  householdsTable,
  maintenanceTasksTable,
  propertiesTable,
  pushTokensTable,
  userProfilesTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { buildDueNotificationMessages } from "../src/notificationPlanner";

const suffix = crypto.randomUUID().replaceAll("-", "");
const tokenA = `ExponentPushToken[${suffix.slice(0, 24)}]`;
const tokenB = `ExponentPushToken[${suffix.slice(8, 32)}]`;
const unownedToken = `ExponentPushToken[${suffix.slice(4, 28)}x]`;
const householdIds: number[] = [];

try {
  const [householdA, householdB] = await db
    .insert(householdsTable)
    .values([
      { name: `Notification household A ${suffix}` },
      { name: `Notification household B ${suffix}` },
    ])
    .returning();
  householdIds.push(householdA.id, householdB.id);

  const [propertyA, propertyB] = await db
    .insert(propertiesTable)
    .values([
      { householdId: householdA.id, name: "Notification property A", type: "house" },
      { householdId: householdB.id, name: "Notification property B", type: "house" },
    ])
    .returning();

  const [memberA, memberB] = await db
    .insert(familyMembersTable)
    .values([
      {
        householdId: householdA.id,
        name: "Notification member A",
        role: "parent",
        color: "#111111",
        avatarInitials: "NA",
      },
      {
        householdId: householdB.id,
        name: "Notification member B",
        role: "parent",
        color: "#222222",
        avatarInitials: "NB",
      },
    ])
    .returning();

  const today = new Date().toISOString().split("T")[0];
  await db
    .insert(choresTable)
    .values([
      {
        title: `Notification chore A ${suffix}`,
        assigneeId: memberA.id,
        propertyId: propertyA.id,
        frequency: "daily",
        dueDate: today,
      },
      {
        title: `Notification chore B ${suffix}`,
        assigneeId: memberB.id,
        propertyId: propertyB.id,
        frequency: "daily",
        dueDate: today,
      },
      {
        title: `Cross-household assignee secret ${suffix}`,
        assigneeId: memberB.id,
        propertyId: propertyA.id,
        frequency: "daily",
        dueDate: today,
      },
    ])
    .returning();

  await db
    .insert(maintenanceTasksTable)
    .values([
      {
        title: `Notification maintenance A ${suffix}`,
        propertyId: propertyA.id,
        category: "other",
        scheduleType: "one-time",
        nextDueDate: today,
      },
      {
        title: `Notification maintenance B ${suffix}`,
        propertyId: propertyB.id,
        category: "other",
        scheduleType: "one-time",
        nextDueDate: today,
      },
    ])
    .returning();

  await db.insert(userProfilesTable).values([
    {
      clerkId: `notification-a-${suffix}`,
      householdId: householdA.id,
      role: "family",
      linkedFamilyMemberId: memberA.id,
    },
    {
      clerkId: `notification-b-${suffix}`,
      householdId: householdB.id,
      role: "family",
      linkedFamilyMemberId: memberB.id,
    },
  ]);
  await db.insert(pushTokensTable).values([
    {
      householdId: householdA.id,
      clerkId: `notification-a-${suffix}`,
      token: tokenA,
    },
    {
      householdId: householdB.id,
      clerkId: `notification-b-${suffix}`,
      token: tokenB,
    },
    {
      householdId: null,
      clerkId: null,
      token: unownedToken,
    },
  ]);

  const messages = await buildDueNotificationMessages(new Date(), new Set());
  const messagesA = messages.filter((message) => message.to === tokenA);
  const messagesB = messages.filter((message) => message.to === tokenB);
  const unownedMessages = messages.filter((message) => message.to === unownedToken);

  assert.equal(messagesA.length, 2, "household A should receive only its assigned chore and maintenance");
  assert.equal(messagesB.length, 2, "household B should receive its chore and maintenance");
  assert.equal(unownedMessages.length, 0, "legacy unowned tokens must receive no notifications");

  for (const message of [...messagesA, ...messagesB]) {
    assert.deepEqual(
      Object.keys(message.data ?? {}),
      ["type"],
      "push payloads must not expose database record IDs",
    );
  }

  const serializedMessages = JSON.stringify([...messagesA, ...messagesB]);
  assert(!serializedMessages.includes(suffix), "task titles must not appear in push payloads");
  assert(
    !serializedMessages.includes(memberA.name) && !serializedMessages.includes(memberB.name),
    "family-member names must not appear in push payloads, including cross-household assignees",
  );

  console.log("Notification household isolation integration test passed");
} finally {
  await db.delete(pushTokensTable).where(eq(pushTokensTable.token, unownedToken));
  if (householdIds.length > 0) {
    await db.delete(householdsTable).where(inArray(householdsTable.id, householdIds));
  }
  await pool.end();
}