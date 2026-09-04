import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { householdsTable } from "./households";

export const householdNotificationPreferencesTable = pgTable(
  "household_notification_preferences",
  {
    householdId: integer("household_id")
      .primaryKey()
      .references(() => householdsTable.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("UTC"),
    dueReminderTime: text("due_reminder_time").notNull().default("08:00"),
    workoutFollowUpTime: text("workout_follow_up_time").notNull().default("08:00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "household_notification_preferences_due_time_check",
      sql`${table.dueReminderTime} ~ '^(?:(?:0[5-9]|1[0-9]):[0-5][0-9]|20:[0-5][0-5])$'`,
    ),
    check(
      "household_notification_preferences_workout_time_check",
      sql`${table.workoutFollowUpTime} ~ '^(?:(?:0[5-9]|1[0-9]):[0-5][0-9]|20:[0-5][0-5])$'`,
    ),
  ],
);

export const notificationDeliveryTable = pgTable(
  "notification_delivery",
  {
    id: serial("id").primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    householdId: integer("household_id")
      .notNull()
      .references(() => householdsTable.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(),
    channel: text("channel").notNull(),
    kind: text("kind").notNull(),
    entityId: integer("entity_id").notNull(),
    localDate: text("local_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notification_delivery_dedupe_key_unique").on(table.dedupeKey),
    index("notification_delivery_reclaim_idx").on(table.sentAt, table.claimedAt),
    index("notification_delivery_household_idx").on(table.householdId),
  ],
);

export type HouseholdNotificationPreferences =
  typeof householdNotificationPreferencesTable.$inferSelect;
export type NotificationDelivery = typeof notificationDeliveryTable.$inferSelect;