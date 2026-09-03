import { db } from "@workspace/db";
import {
  aiMemoriesTable,
  mealPlansTable,
  mealRatingsTable,
  propertiesTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

type MealPreference = "love" | "skip";

interface MealRatingRecord {
  meal: string;
  rating: string | null;
}

function normalizeMealName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeMemoryContent(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function memoryFact(meal: string, preference: MealPreference): string {
  return preference === "love"
    ? `${meal} is a household favorite`
    : `Family consistently skips ${meal}`;
}

/**
 * Turn repeated meal ratings into a durable household memory.
 *
 * This intentionally uses the household relationship on properties for every
 * read. The caller has already authorized the triggering meal plan, but the
 * extractor must not accidentally learn from another household's ratings.
 */
export async function extractAndSaveMealMemories(
  householdId: number,
  mealPlanId: number,
): Promise<string[]> {
  try {
    const [target] = await db
      .select({ meal: mealPlansTable.meal })
      .from(mealPlansTable)
      .innerJoin(propertiesTable, eq(mealPlansTable.propertyId, propertiesTable.id))
      .where(and(
        eq(mealPlansTable.id, mealPlanId),
        eq(propertiesTable.householdId, householdId),
      ))
      .limit(1);

    if (!target?.meal?.trim()) return [];

    const [planRatings, memberRatings, existingMemories] = await Promise.all([
      db
        .select({
          meal: mealPlansTable.meal,
          rating: mealPlansTable.rating,
        })
        .from(mealPlansTable)
        .innerJoin(propertiesTable, eq(mealPlansTable.propertyId, propertiesTable.id))
        .where(eq(propertiesTable.householdId, householdId)),
      db
        .select({
          meal: mealPlansTable.meal,
          rating: mealRatingsTable.rating,
        })
        .from(mealRatingsTable)
        .innerJoin(mealPlansTable, eq(mealRatingsTable.mealPlanId, mealPlansTable.id))
        .innerJoin(propertiesTable, eq(mealPlansTable.propertyId, propertiesTable.id))
        .where(eq(propertiesTable.householdId, householdId)),
      db
        .select({ content: aiMemoriesTable.content })
        .from(aiMemoriesTable)
        .where(eq(aiMemoriesTable.householdId, householdId)),
    ]);

    const targetMealKey = normalizeMealName(target.meal);
    const counts: Record<MealPreference, number> = { love: 0, skip: 0 };
    const allRatings: MealRatingRecord[] = [...planRatings, ...memberRatings];

    for (const row of allRatings) {
      if (normalizeMealName(row.meal) !== targetMealKey) continue;
      if (row.rating === "love" || row.rating === "skip") {
        counts[row.rating] += 1;
      }
    }

    const facts = (["love", "skip"] as const)
      .filter((preference) => counts[preference] >= 2)
      .map((preference) => memoryFact(target.meal.trim(), preference));

    if (facts.length === 0) return [];

    const known = new Set(existingMemories.map((memory) => normalizeMemoryContent(memory.content)));
    const newFacts = facts.filter((fact) => {
      const key = normalizeMemoryContent(fact);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });

    for (const content of newFacts) {
      await db.insert(aiMemoriesTable).values({
        householdId,
        content,
        category: "meals",
        source: "meals",
      });
    }

    return newFacts;
  } catch (error) {
    console.error("Meal memory extraction failed:", error);
    return [];
  }
}