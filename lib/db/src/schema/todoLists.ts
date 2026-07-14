import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { familyMembersTable } from "./familyMembers";
import { propertiesTable } from "./properties";

export const todoListsTable = pgTable("todo_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  assigneeId: integer("assignee_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTodoListSchema = createInsertSchema(todoListsTable).omit({ id: true, createdAt: true });
export type InsertTodoList = z.infer<typeof insertTodoListSchema>;
export type TodoList = typeof todoListsTable.$inferSelect;
