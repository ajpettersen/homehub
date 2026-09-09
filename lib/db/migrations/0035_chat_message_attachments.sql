CREATE TABLE IF NOT EXISTS "chat_message_attachments" (
  "id" serial PRIMARY KEY,
  "chat_message_id" integer NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "object_path" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chat_message_attachments_message_id_idx"
  ON "chat_message_attachments" ("chat_message_id");

CREATE UNIQUE INDEX IF NOT EXISTS "chat_message_attachments_object_path_unique"
  ON "chat_message_attachments" ("object_path");