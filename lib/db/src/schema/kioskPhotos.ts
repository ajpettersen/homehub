import { customType, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { householdsTable } from "./households";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// The wall screen's background photo. Kept in the database rather than the
// repo because the repo is public and this is a picture of someone's house.
export const kioskPhotosTable = pgTable("kiosk_photos", {
  householdId: integer("household_id").primaryKey().references(() => householdsTable.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  bytes: bytea("bytes").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KioskPhoto = typeof kioskPhotosTable.$inferSelect;
