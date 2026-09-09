import { mealPlansTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

export type MealPlanSlotInput = {
  weekStart: string | Date;
  dayOfWeek: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  meal: string;
  notes?: string | null;
  rating?: "love" | "ok" | "skip" | null;
};

export async function upsertMealPlanSlot(
  tx: any,
  input: MealPlanSlotInput,
  propertyId: number,
  options: { fillEmptyOnly?: boolean } = {},
) {
  const weekStart = input.weekStart instanceof Date
    ? input.weekStart.toISOString().slice(0, 10)
    : input.weekStart;
  const lockKey =
    `meal-plan-slot:${propertyId}:${weekStart}:${input.dayOfWeek}:${input.mealType}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
  const [existing] = await tx
    .select()
    .from(mealPlansTable)
    .where(and(
      eq(mealPlansTable.propertyId, propertyId),
      eq(mealPlansTable.weekStart, weekStart),
      eq(mealPlansTable.dayOfWeek, input.dayOfWeek),
      eq(mealPlansTable.mealType, input.mealType),
    ))
    .orderBy(desc(mealPlansTable.id))
    .limit(1);

  if (existing && options.fillEmptyOnly) return existing;

  if (existing) {
    const [updated] = await tx
      .update(mealPlansTable)
      .set({
        meal: input.meal.trim(),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
      })
      .where(eq(mealPlansTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await tx
    .insert(mealPlansTable)
    .values({
      weekStart,
      dayOfWeek: input.dayOfWeek,
      mealType: input.mealType,
      meal: input.meal.trim(),
      notes: input.notes ?? null,
      rating: input.rating ?? null,
      propertyId,
    })
    .returning();
  return created;
}