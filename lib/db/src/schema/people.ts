import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const peopleTable = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  groups: text("groups").array().notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Person = typeof peopleTable.$inferSelect;