import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";

// A household's Hatch account, entered by a parent in the app. The password is
// encrypted (see api-server/src/lib/hatchCrypto.ts); it is never returned to
// the browser or written to logs.
export const hatchConnectionsTable = pgTable("hatch_connections", {
  householdId: integer("household_id").primaryKey().references(() => householdsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HatchConnection = typeof hatchConnectionsTable.$inferSelect;
