import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import { aiMemoriesTable, familyMembersTable, householdsTable, userProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { deletableMemoryWhere, visibleMemoryWhere } from "../src/routes/ai";

const suffix = crypto.randomUUID().replaceAll("-", "");
let householdId: number | null = null;

try {
  const [household] = await db.insert(householdsTable)
    .values({ name: `Memory authorization ${suffix}` }).returning();
  householdId = household.id;
  const [adminAdult, otherAdult] = await db.insert(familyMembersTable).values([
    {
      householdId,
      name: `Admin adult ${suffix}`,
      role: "parent",
      color: "#111111",
      avatarInitials: "AA",
    },
    {
      householdId,
      name: `Other adult ${suffix}`,
      role: "parent",
      color: "#222222",
      avatarInitials: "OA",
    },
  ]).returning();
  const [shared, adminPersonal, otherPersonal] = await db.insert(aiMemoriesTable).values([
    { householdId, content: `shared ${suffix}`, category: "general", source: "auto" },
    { householdId, subjectFamilyMemberId: adminAdult.id, content: `admin ${suffix}`, category: "general", source: "chat" },
    { householdId, subjectFamilyMemberId: otherAdult.id, content: `other ${suffix}`, category: "general", source: "chat" },
  ]).returning();
  await db.insert(userProfilesTable).values({
    clerkId: `memory-admin-${suffix}`,
    householdId,
    role: "family",
    isAdmin: true,
    linkedFamilyMemberId: adminAdult.id,
  });

  // Both the list endpoint and prompt context use this exact visibility predicate.
  const adminVisible = await db.select({ id: aiMemoriesTable.id }).from(aiMemoriesTable)
    .where(visibleMemoryWhere(householdId, adminAdult.id));
  const otherVisible = await db.select({ id: aiMemoriesTable.id }).from(aiMemoriesTable)
    .where(visibleMemoryWhere(householdId, otherAdult.id));
  assert.deepEqual(new Set(adminVisible.map(row => row.id)), new Set([shared.id, adminPersonal.id]));
  assert.deepEqual(new Set(otherVisible.map(row => row.id)), new Set([shared.id, otherPersonal.id]));

  // The caller is an administrator, but administration never grants access to
  // another adult's subject-bound fact.
  const blocked = await db.delete(aiMemoriesTable)
    .where(deletableMemoryWhere(householdId, adminAdult.id, otherPersonal.id))
    .returning({ id: aiMemoriesTable.id });
  assert.equal(blocked.length, 0, "an admin must not delete another adult's personal memory");

  const ownDeleted = await db.delete(aiMemoriesTable)
    .where(deletableMemoryWhere(householdId, adminAdult.id, adminPersonal.id))
    .returning({ id: aiMemoriesTable.id });
  assert.deepEqual(ownDeleted.map(row => row.id), [adminPersonal.id]);
  const sharedDeleted = await db.delete(aiMemoriesTable)
    .where(deletableMemoryWhere(householdId, adminAdult.id, shared.id))
    .returning({ id: aiMemoriesTable.id });
  assert.deepEqual(sharedDeleted.map(row => row.id), [shared.id]);

  console.log("Memory authorization integration test passed");
} finally {
  if (householdId !== null) {
    await db.delete(householdsTable).where(eq(householdsTable.id, householdId));
  }
  await pool.end();
}