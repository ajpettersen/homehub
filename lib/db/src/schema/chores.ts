import { sql } from "drizzle-orm";
import { check, pgTable, serial, text, integer, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { familyMembersTable } from "./familyMembers";
import { propertiesTable } from "./properties";

export const choresTable = pgTable(
  "chores",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    assigneeId: integer("assignee_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
    propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
    frequency: text("frequency").notNull().default("weekly"), // daily | weekly | biweekly | monthly | custom
    dueDate: date("due_date", { mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"),
    points: integer("points").notNull().default(10),
    rewardCents: integer("reward_cents").notNull().default(0),
    bundleItems: jsonb("bundle_items").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("open"), // open | pending | approved
    completionNote: text("completion_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    check("chores_reward_nonnegative", sql`${table.rewardCents} >= 0`),
    check("chores_bundle_items_array", sql`jsonb_typeof(${table.bundleItems}) = 'array'`),
    check("chores_status_check", sql`${table.status} IN ('open', 'pending', 'approved')`),
  ],
);

export const insertChoreSchema = createInsertSchema(choresTable).omit({ id: true, createdAt: true, completedAt: true, completedBy: true });
export type InsertChore = z.infer<typeof insertChoreSchema>;
export type Chore = typeof choresTable.$inferSelect;
