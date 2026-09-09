import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { chatMessagesTable } from "./chatMessages";

export const chatMessageAttachmentsTable = pgTable(
  "chat_message_attachments",
  {
    id: serial("id").primaryKey(),
    chatMessageId: integer("chat_message_id")
      .notNull()
      .references(() => chatMessagesTable.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("chat_message_attachments_message_id_idx").on(table.chatMessageId),
    uniqueIndex("chat_message_attachments_object_path_unique").on(table.objectPath),
  ],
);

export const insertChatMessageAttachmentSchema = createInsertSchema(
  chatMessageAttachmentsTable,
).omit({
  id: true,
  createdAt: true,
});

export type ChatMessageAttachment = typeof chatMessageAttachmentsTable.$inferSelect;
export type InsertChatMessageAttachment = z.infer<typeof insertChatMessageAttachmentSchema>;