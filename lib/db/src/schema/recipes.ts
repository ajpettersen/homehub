import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export type RecipeIngredient = {
  name: string;
  quantity?: string;
  category?: string;
};

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  timesCooked: integer("times_cooked").notNull().default(0),
  // aggregateRating: most recent rating from meal plan usage (love | ok | skip)
  aggregateRating: text("aggregate_rating"),
  ingredients: jsonb("ingredients").$type<RecipeIngredient[]>().notNull().default([]),
  instructions: jsonb("instructions").$type<string[]>().notNull().default([]),
  servings: integer("servings"),
  prepMinutes: integer("prep_minutes"),
  cookMinutes: integer("cook_minutes"),
  sourceType: text("source_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRecipeSchema = createInsertSchema(recipesTable).omit({ id: true, createdAt: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipesTable.$inferSelect;
