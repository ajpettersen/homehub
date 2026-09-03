import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { householdsTable } from "./households";

export type WebPushKeys = {
  p256dh: string;
  auth: string;
};

export const webPushSubscriptionsTable = pgTable(
  "web_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id")
      .notNull()
      .references(() => householdsTable.id, { onDelete: "cascade" }),
    clerkId: text("clerk_id").notNull(),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<WebPushKeys>().notNull(),
    deviceLabel: text("device_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("web_push_subscriptions_endpoint_unique").on(table.endpoint),
  ],
);

export type WebPushSubscription = typeof webPushSubscriptionsTable.$inferSelect;