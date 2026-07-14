import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { groceryListsTable } from "./groceryLists";

export const groceryItemsTable = pgTable("grocery_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => groceryListsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: text("quantity"),
  category: text("category"),
  checked: boolean("checked").notNull().default(false),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGroceryItemSchema = createInsertSchema(groceryItemsTable).omit({ id: true, createdAt: true });
export type InsertGroceryItem = z.infer<typeof insertGroceryItemSchema>;
export type GroceryItem = typeof groceryItemsTable.$inferSelect;
