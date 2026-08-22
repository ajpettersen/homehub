import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";

export const aiMemoriesTable = pgTable("ai_memories", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"), // workout | meals | family | general
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiMemory = typeof aiMemoriesTable.$inferSelect;
