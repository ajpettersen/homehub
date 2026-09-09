import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const chatAttachmentCleanupQueueTable = pgTable(
  "chat_attachment_cleanup_queue",
  {
    objectPath: text("object_path").primaryKey(),
    deleteAfter: timestamp("delete_after", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);