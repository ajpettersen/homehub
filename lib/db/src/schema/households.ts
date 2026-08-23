import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const householdsTable = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Set when the household owner finishes (or skips) first-login setup.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Household = typeof householdsTable.$inferSelect;