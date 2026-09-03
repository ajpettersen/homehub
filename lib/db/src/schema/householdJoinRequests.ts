import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";

export const householdJoinRequestsTable = pgTable("household_join_requests", {
  id: serial("id").primaryKey(),
  requesterClerkId: text("requester_clerk_id").notNull().unique(),
  targetHouseholdId: integer("target_household_id")
    .notNull()
    .references(() => householdsTable.id, { onDelete: "cascade" }),
  requesterDisplayName: text("requester_display_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'denied'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export type HouseholdJoinRequest = typeof householdJoinRequestsTable.$inferSelect;