import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const HOMEHUB_WEB_TABS = [
  "home",
  "properties",
  "chores",
  "meals",
  "tasks",
  "workouts",
  "people",
  "settings",
] as const;

export type HomeHubWebTab = (typeof HOMEHUB_WEB_TABS)[number];

export const homeHubWebTabEnum = pgEnum("homehub_web_tab", HOMEHUB_WEB_TABS);

export const householdsTable = pgTable(
  "households",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    visibleTabs: homeHubWebTabEnum("visible_tabs")
      .array()
      .notNull()
      .default([...HOMEHUB_WEB_TABS]),
    // Set when the household owner finishes (or skips) first-login setup.
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    check(
      "households_required_visible_tabs",
      sql`'home'::homehub_web_tab = ANY (${table.visibleTabs})
        AND 'settings'::homehub_web_tab = ANY (${table.visibleTabs})`,
    ),
  ],
);

export type Household = typeof householdsTable.$inferSelect;
