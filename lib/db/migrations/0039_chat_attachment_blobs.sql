CREATE TABLE IF NOT EXISTS "chat_attachment_blobs" (
  "object_path" text PRIMARY KEY,
  "mime_type" text NOT NULL,
  "bytes" bytea NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
