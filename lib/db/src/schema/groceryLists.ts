import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const groceryListsTable = pgTable("grocery_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGroceryListSchema = createInsertSchema(groceryListsTable).omit({ id: true, createdAt: true });
export type InsertGroceryList = z.infer<typeof insertGroceryListSchema>;
export type GroceryList = typeof groceryListsTable.$inferSelect;
