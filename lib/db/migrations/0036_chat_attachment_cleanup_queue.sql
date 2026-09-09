CREATE TABLE IF NOT EXISTS "chat_attachment_cleanup_queue" (
  "object_path" text PRIMARY KEY,
  "delete_after" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION queue_deleted_chat_attachment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO chat_attachment_cleanup_queue (object_path)
  VALUES (OLD.object_path)
  ON CONFLICT (object_path)
  DO UPDATE SET delete_after = now();
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS chat_attachment_delete_cleanup
  ON chat_message_attachments;

CREATE TRIGGER chat_attachment_delete_cleanup
AFTER DELETE ON chat_message_attachments
FOR EACH ROW
EXECUTE FUNCTION queue_deleted_chat_attachment();