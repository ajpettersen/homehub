import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import {
  choresTable,
  familyMembersTable,
  householdsTable,
  maintenanceTasksTable,
  mealPlansTable,
  propertiesTable,
} from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import {
  formatLiveSnapshot,
  getLiveHouseholdSnapshot,
} from "../src/lib/aiLiveContext";

function dateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function weekStartString(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return dateString(start);
}

const suffix = crypto.randomUUID().replaceAll("-", "");
const now = new Date("2026-08-22T12:00:00.000Z");
const today = dateString(now);
const weekStart = weekStartString(now);
const householdIds: number[] = [];

try {
  const [householdA, householdB] = await db
    .insert(householdsTable)
    .values([
      { name: `Snapshot household A ${suffix}` },
      { name: `Snapshot household B ${suffix}` },
    ])
    .returning();
  householdIds.push(householdA.id, householdB.id);

  const [propertyA, propertyB] = await db
    .insert(propertiesTable)
    .values([
      { householdId: householdA.id, name: `Snapshot property A ${suffix}`, type: "house" },
      { householdId: householdB.id, name: `Snapshot property B ${suffix}`, type: "cabin" },
    ])
    .returning();

  const [memberA, memberB] = await db
    .insert(familyMembersTable)
    .values([
      {
        householdId: householdA.id,
        name: `Snapshot member A ${suffix}`,
        role: "parent",
        color: "#111111",
        avatarInitials: "SA",
      },
      {
        householdId: householdB.id,
        name: `Snapshot member B ${suffix}`,
        role: "parent",
        color: "#222222",
        avatarInitials: "SB",
      },
    ])
    .returning();

  await db.insert(mealPlansTable).values([
    {
      weekStart,
      dayOfWeek: now.getDay(),
      mealType: "dinner",
      meal: `Snapshot meal A ${suffix}`,
      notes: "serve a side salad",
      propertyId: propertyA.id,
    },
    {
      weekStart,
      dayOfWeek: now.getDay(),
      mealType: "dinner",
      meal: `Snapshot meal B ${suffix}`,
      propertyId: propertyB.id,
    },
    {
      weekStart,
      dayOfWeek: (now.getDay() + 1) % 7,
      mealType: "dinner",
      meal: `Snapshot tomorrow meal ${suffix}`,
      propertyId: propertyA.id,
    },
  ]);

  await db.insert(maintenanceTasksTable).values([
    {
      title: `Snapshot overdue maintenance A ${suffix}`,
      propertyId: propertyA.id,
      category: "seasonal",
      scheduleType: "one-time",
      nextDueDate: "2026-08-20",
    },
    {
      title: `Snapshot upcoming maintenance A ${suffix}`,
      propertyId: propertyA.id,
      category: "yard",
      scheduleType: "one-time",
      nextDueDate: "2026-08-26",
    },
    {
      title: `Snapshot distant maintenance A ${suffix}`,
      propertyId: propertyA.id,
      category: "other",
      scheduleType: "one-time",
      nextDueDate: "2026-09-01",
    },
    {
      title: `Snapshot maintenance B ${suffix}`,
      propertyId: propertyB.id,
      category: "other",
      scheduleType: "one-time",
      nextDueDate: today,
    },
  ]);

  await db.insert(choresTable).values([
    {
      title: `Snapshot chore A ${suffix}`,
      assigneeId: memberA.id,
      propertyId: propertyA.id,
      frequency: "daily",
      dueDate: today,
    },
    {
      title: `Snapshot completed chore A ${suffix}`,
      assigneeId: memberA.id,
      propertyId: propertyA.id,
      frequency: "daily",
      dueDate: today,
      completedAt: now,
    },
    {
      title: `Snapshot chore B ${suffix}`,
      assigneeId: memberB.id,
      propertyId: propertyB.id,
      frequency: "daily",
      dueDate: today,
    },
    {
      title: `Snapshot cross-household assignee ${suffix}`,
      assigneeId: memberB.id,
      propertyId: propertyA.id,
      frequency: "daily",
      dueDate: today,
    },
  ]);

  const snapshot = await getLiveHouseholdSnapshot([propertyA.id], now);

  assert.deepEqual(
    snapshot.meals.map((meal) => meal.meal),
    [`Snapshot meal A ${suffix}`],
    "only today's meal from the authorized property belongs in the snapshot",
  );
  assert.deepEqual(
    snapshot.maintenance.map((task) => task.title),
    [
      `Snapshot overdue maintenance A ${suffix}`,
      `Snapshot upcoming maintenance A ${suffix}`,
    ],
    "only overdue and next-seven-day maintenance for the authorized property belongs in the snapshot",
  );
  assert.deepEqual(
    snapshot.chores.map((chore) => chore.title),
    [
      `Snapshot chore A ${suffix}`,
      `Snapshot cross-household assignee ${suffix}`,
    ],
    "only active chores for the authorized property belong in the snapshot",
  );
  assert.equal(
    snapshot.chores.find((chore) => chore.title === `Snapshot chore A ${suffix}`)?.assigneeName,
    memberA.name,
  );
  assert.equal(
    snapshot.chores.find((chore) => chore.title === `Snapshot cross-household assignee ${suffix}`)?.assigneeName,
    null,
    "a malformed cross-household assignment must not expose another household member",
  );

  const formatted = formatLiveSnapshot(snapshot, now);
  assert(formatted.includes("Today's snapshot"));
  assert(formatted.includes(`Snapshot meal A ${suffix}`));
  assert(formatted.includes(`Snapshot overdue maintenance A ${suffix}`));
  assert(formatted.includes(`Snapshot upcoming maintenance A ${suffix}`));
  assert(formatted.includes(`Snapshot chore A ${suffix}`));
  assert(!formatted.includes(`Snapshot meal B ${suffix}`));
  assert(!formatted.includes(`Snapshot maintenance B ${suffix}`));
  assert(!formatted.includes(`Snapshot chore B ${suffix}`));
  assert(!formatted.includes(memberB.name));

  console.log("AI live household snapshot integration test passed");
} finally {
  if (householdIds.length > 0) {
    await db.delete(householdsTable).where(inArray(householdsTable.id, householdIds));
  }
  await pool.end();
}