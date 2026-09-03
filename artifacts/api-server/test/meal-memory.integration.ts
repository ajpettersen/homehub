import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import {
  aiMemoriesTable,
  familyMembersTable,
  householdsTable,
  mealPlansTable,
  mealRatingsTable,
  propertiesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { extractAndSaveMealMemories } from "../src/lib/mealMemory";

const suffix = crypto.randomUUID().replaceAll("-", "");
const mealName = `Memory tacos ${suffix}`;
const skippedMealName = `Memory fish ${suffix}`;
const householdIds: number[] = [];

try {
  const [householdA, householdB] = await db
    .insert(householdsTable)
    .values([
      { name: `Meal memory household A ${suffix}` },
      { name: `Meal memory household B ${suffix}` },
    ])
    .returning();
  householdIds.push(householdA.id, householdB.id);

  const [propertyA, propertyB] = await db
    .insert(propertiesTable)
    .values([
      { householdId: householdA.id, name: "Meal memory property A", type: "house" },
      { householdId: householdB.id, name: "Meal memory property B", type: "house" },
    ])
    .returning();

  const [memberA, memberB] = await db
    .insert(familyMembersTable)
    .values([
      {
        householdId: householdA.id,
        name: "Meal memory member A",
        role: "parent",
        color: "#111111",
        avatarInitials: "MA",
      },
      {
        householdId: householdB.id,
        name: "Meal memory member B",
        role: "parent",
        color: "#222222",
        avatarInitials: "MB",
      },
    ])
    .returning();

  const plans = await db
    .insert(mealPlansTable)
    .values([
      {
        weekStart: "2026-08-23",
        dayOfWeek: 2,
        mealType: "dinner",
        meal: mealName,
        propertyId: propertyA.id,
      },
      {
        weekStart: "2026-08-30",
        dayOfWeek: 2,
        mealType: "dinner",
        meal: mealName.toUpperCase(),
        propertyId: propertyA.id,
      },
      {
        weekStart: "2026-08-23",
        dayOfWeek: 2,
        mealType: "dinner",
        meal: mealName,
        propertyId: propertyB.id,
      },
      {
        weekStart: "2026-08-23",
        dayOfWeek: 3,
        mealType: "dinner",
        meal: skippedMealName,
        rating: "skip",
        propertyId: propertyA.id,
      },
      {
        weekStart: "2026-08-30",
        dayOfWeek: 3,
        mealType: "dinner",
        meal: skippedMealName,
        rating: "skip",
        propertyId: propertyA.id,
      },
    ])
    .returning();

  await db.insert(mealRatingsTable).values([
    { mealPlanId: plans[0].id, memberId: memberA.id, rating: "love" },
    { mealPlanId: plans[2].id, memberId: memberB.id, rating: "love" },
  ]);

  await extractAndSaveMealMemories(householdA.id, plans[0].id);
  let memories = await db
    .select()
    .from(aiMemoriesTable)
    .where(eq(aiMemoriesTable.householdId, householdA.id));
  assert.equal(memories.length, 0, "another household's rating must not satisfy the threshold");

  await db
    .update(mealPlansTable)
    .set({ rating: "love" })
    .where(eq(mealPlansTable.id, plans[1].id));

  await extractAndSaveMealMemories(householdA.id, plans[1].id);
  await extractAndSaveMealMemories(householdA.id, plans[1].id);
  await extractAndSaveMealMemories(householdA.id, plans[3].id);

  memories = await db
    .select()
    .from(aiMemoriesTable)
    .where(eq(aiMemoriesTable.householdId, householdA.id));

  assert.deepEqual(
    memories.map(({ category, source }) => ({ category, source })),
    [
      { category: "meals", source: "meals" },
      { category: "meals", source: "meals" },
    ],
  );
  assert.equal(
    memories.filter((memory) => memory.content.toLowerCase().includes(mealName.toLowerCase())).length,
    1,
    "re-running extraction must not duplicate a fact",
  );
  assert.ok(
    memories.some((memory) => memory.content === `Family consistently skips ${skippedMealName}`),
    "two skip ratings should create a skip memory",
  );

  console.log("Meal memory integration test passed");
} finally {
  if (householdIds.length > 0) {
    await db.delete(householdsTable).where(eq(householdsTable.id, householdIds[0]));
    if (householdIds.length > 1) {
      await db.delete(householdsTable).where(eq(householdsTable.id, householdIds[1]));
    }
  }
  await pool.end();
}