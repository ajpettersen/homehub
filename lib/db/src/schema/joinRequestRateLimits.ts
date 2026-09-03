import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const joinRequestRateLimitsTable = pgTable(
  "join_request_rate_limits",
  {
    requesterHash: text("requester_hash").notNull(),
    clientIpHash: text("client_ip_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    attemptCount: integer("attempt_count").notNull().default(0),
  },
  table => [
    unique("join_request_rate_limits_requester_ip_unique")
      .on(table.requesterHash, table.clientIpHash),
  ],
);