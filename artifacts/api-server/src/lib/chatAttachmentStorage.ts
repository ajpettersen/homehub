import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  chatAttachmentBlobsTable,
  chatAttachmentCleanupQueueTable,
} from "@workspace/db";

// Attachment bytes live in Postgres (chat_attachment_blobs) rather than an
// external object store. The original implementation used Replit's private
// object storage via a sidecar that only exists inside Replit's
// infrastructure; images are small (≤8 MB), transient unless a message
// persists them, and low-volume for a single household, so the database is
// the simplest portable home for them.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type StoredChatAttachment = {
  objectPath: string;
  mimeType: string;
  sizeBytes: number;
};

function decodeImageDataUrl(dataUrl: string): {
  bytes: Buffer;
  mimeType: string;
  extension: string;
} {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("Assistant attachments must be base64 image data URLs");
  }
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("Assistant attachments must be JPEG, PNG, WebP, or GIF images");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Each assistant image must be between 1 byte and 8 MB");
  }
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  return { bytes, mimeType, extension };
}

export async function uploadChatAttachment(
  householdId: number,
  dataUrl: string,
): Promise<StoredChatAttachment> {
  const { bytes, mimeType, extension } = decodeImageDataUrl(dataUrl);
  const objectPath = `/db/chat/${householdId}/${randomUUID()}.${extension}`;
  await db
    .insert(chatAttachmentCleanupQueueTable)
    .values({
      objectPath,
      deleteAfter: new Date(Date.now() + 60 * 60 * 1000),
    })
    .onConflictDoUpdate({
      target: chatAttachmentCleanupQueueTable.objectPath,
      set: { deleteAfter: new Date(Date.now() + 60 * 60 * 1000) },
    });
  await db.insert(chatAttachmentBlobsTable).values({
    objectPath,
    mimeType,
    bytes,
  });
  return { objectPath, mimeType, sizeBytes: bytes.length };
}

export async function getChatAttachment(
  objectPath: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const [row] = await db
    .select({
      bytes: chatAttachmentBlobsTable.bytes,
      mimeType: chatAttachmentBlobsTable.mimeType,
    })
    .from(chatAttachmentBlobsTable)
    .where(eq(chatAttachmentBlobsTable.objectPath, objectPath))
    .limit(1);
  return row ?? null;
}

export async function deleteChatAttachment(objectPath: string): Promise<void> {
  await db
    .delete(chatAttachmentBlobsTable)
    .where(eq(chatAttachmentBlobsTable.objectPath, objectPath));
}
