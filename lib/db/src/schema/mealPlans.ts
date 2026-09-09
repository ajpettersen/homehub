import { pgTable, serial, text, integer, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const mealPlansTable = pgTable(
  "meal_plans",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    dayOfWeek: integer("day_of_week").notNull(), // 0=Sun, 6=Sat
    mealType: text("meal_type").notNull().default("dinner"), // breakfast | lunch | dinner | snack
    meal: text("meal").notNull(),
    notes: text("notes"),
    rating: text("rating"), // love | ok | skip
    propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meal_plans_property_week_day_type_unique").on(
      table.propertyId,
      table.weekStart,
      table.dayOfWeek,
      table.mealType,
    ),
  ],
);

export const insertMealPlanSchema = createInsertSchema(mealPlansTable).omit({ id: true, createdAt: true });
export type InsertMealPlan = z.infer<typeof insertMealPlanSchema>;
export type MealPlan = typeof mealPlansTable.$inferSelect;
