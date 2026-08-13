import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const aiMemoriesTable = pgTable("ai_memories", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"), // workout | meals | family | general
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiMemory = typeof aiMemoriesTable.$inferSelect;
