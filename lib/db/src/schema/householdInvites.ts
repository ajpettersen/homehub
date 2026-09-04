import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";

export const householdInvitesTable = pgTable("household_invites", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id")
    .notNull()
    .references(() => householdsTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdByClerkId: text("created_by_clerk_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  redeemedByClerkId: text("redeemed_by_clerk_id"),
});

export type HouseholdInvite = typeof householdInvitesTable.$inferSelect;