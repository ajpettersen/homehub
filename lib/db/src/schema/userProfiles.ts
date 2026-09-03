import { boolean, pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import { familyMembersTable } from "./familyMembers";
import { householdsTable } from "./households";

export const userProfilesTable = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").unique().notNull(),
  householdId: integer("household_id").references(() => householdsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("pending"), // 'family' | 'cleaner' | 'pending'
  isAdmin: boolean("is_admin").notNull().default(false),
  allowedPropertyId: integer("allowed_property_id").references(() => propertiesTable.id, { onDelete: "set null" }),
  linkedFamilyMemberId: integer("linked_family_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserProfile = typeof userProfilesTable.$inferSelect;
