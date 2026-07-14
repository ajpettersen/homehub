import { pgTable, serial, text, integer, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { todoListsTable } from "./todoLists";
import { familyMembersTable } from "./familyMembers";

export const todoItemsTable = pgTable("todo_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => todoListsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: date("due_date", { mode: "string" }),
  assigneeId: integer("assignee_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTodoItemSchema = createInsertSchema(todoItemsTable).omit({ id: true, createdAt: true });
export type InsertTodoItem = z.infer<typeof insertTodoItemSchema>;
export type TodoItem = typeof todoItemsTable.$inferSelect;
