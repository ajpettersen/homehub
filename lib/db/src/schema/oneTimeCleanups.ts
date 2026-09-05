import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const oneTimeCleanupsTable = pgTable("one_time_cleanups", {
  key: text("key").primaryKey(),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OneTimeCleanup = typeof oneTimeCleanupsTable.$inferSelect;