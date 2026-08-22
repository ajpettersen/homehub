import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const householdsTable = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Household = typeof householdsTable.$inferSelect;