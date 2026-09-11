import { customType, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const chatAttachmentBlobsTable = pgTable("chat_attachment_blobs", {
  objectPath: text("object_path").primaryKey(),
  mimeType: text("mime_type").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatAttachmentBlob = typeof chatAttachmentBlobsTable.$inferSelect;
