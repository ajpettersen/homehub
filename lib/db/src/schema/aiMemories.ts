import { foreignKey, index, pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";
import { familyMembersTable } from "./familyMembers";

export const aiMemoriesTable = pgTable("ai_memories", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  subjectFamilyMemberId: integer("subject_family_member_id"),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"), // workout | meals | family | general
  source: text("source"), // chat | meals | auto
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.subjectFamilyMemberId, table.householdId],
    foreignColumns: [familyMembersTable.id, familyMembersTable.householdId],
    name: "ai_memories_subject_household_family_member_fk",
  }).onDelete("cascade"),
  index("ai_memories_household_subject_idx").on(table.householdId, table.subjectFamilyMemberId),
]);

export type AiMemory = typeof aiMemoriesTable.$inferSelect;
