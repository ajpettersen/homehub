import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";

export const pushTokensTable = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").references(() => householdsTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id"),
  token: text("token").notNull().unique(),
  deviceLabel: text("device_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushToken = typeof pushTokensTable.$inferSelect;
