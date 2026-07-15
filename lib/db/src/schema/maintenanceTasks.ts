import { pgTable, serial, text, integer, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const maintenanceTasksTable = pgTable("maintenance_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  category: text("category").notNull().default("other"), // filter | water | seasonal | appliance | yard | other | cleaning
  frequencyDays: integer("frequency_days").notNull().default(30),
  isCleanerTask: boolean("is_cleaner_task").notNull().default(false),
  lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
  lastCompletedBy: text("last_completed_by"),
  nextDueDate: date("next_due_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaintenanceTaskSchema = createInsertSchema(maintenanceTasksTable).omit({ id: true, createdAt: true, lastCompletedAt: true });
export type InsertMaintenanceTask = z.infer<typeof insertMaintenanceTaskSchema>;
export type MaintenanceTask = typeof maintenanceTasksTable.$inferSelect;
