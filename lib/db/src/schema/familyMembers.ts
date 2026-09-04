import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { householdsTable } from "./households";

export const familyMembersTable = pgTable("family_members", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull().default("child"), // parent | child | pet
  color: text("color").notNull().default("#2D6A4F"),
  avatarInitials: text("avatar_initials").notNull(),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("family_members_id_household_key").on(table.id, table.householdId),
]);

export const insertFamilyMemberSchema = createInsertSchema(familyMembersTable).omit({ id: true, createdAt: true });
export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;
export type FamilyMember = typeof familyMembersTable.$inferSelect;
