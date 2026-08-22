import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mealPlansTable } from "./mealPlans";
import { familyMembersTable } from "./familyMembers";

export const mealRatingsTable = pgTable(
  "meal_ratings",
  {
    id: serial("id").primaryKey(),
    mealPlanId: integer("meal_plan_id")
      .notNull()
      .references(() => mealPlansTable.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => familyMembersTable.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(), // love | ok | skip
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("meal_ratings_meal_member_unique").on(t.mealPlanId, t.memberId)],
);

export const insertMealRatingSchema = createInsertSchema(mealRatingsTable).omit({ id: true, createdAt: true });
export type InsertMealRating = z.infer<typeof insertMealRatingSchema>;
export type MealRating = typeof mealRatingsTable.$inferSelect;
