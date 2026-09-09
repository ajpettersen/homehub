import { randomUUID } from "node:crypto";
import { db, chatAttachmentCleanupQueueTable } from "@workspace/db";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type SignedMethod = "GET" | "PUT" | "DELETE";

export type StoredChatAttachment = {
  objectPath: string;
  mimeType: string;
  sizeBytes: number;
};

function getPrivateObjectDir(): string {
  const privateDir = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!privateDir) {
    throw new Error("Private object storage is not configured");
  }
  return privateDir.startsWith("/") ? privateDir : `/${privateDir}`;
}

function parseObjectPath(objectPath: string): {
  bucketName: string;
  objectName: string;
} {
  const parts = objectPath.replace(/^\/+/, "").split("/");
  const [bucketName, ...objectNameParts] = parts;
  if (!bucketName || objectNameParts.length === 0) {
    throw new Error("Invalid private object path");
  }
  return {
    bucketName,
    objectName: objectNameParts.join("/"),
  };
}

async function signObjectUrl(
  objectPath: string,
  method: SignedMethod,
  ttlSec: number,
): Promise<string> {
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not authorize private object storage (${response.status})`);
  }
  const data = await response.json() as { signed_url?: unknown };
  if (typeof data.signed_url !== "string") {
    throw new Error("Private object storage returned an invalid signed URL");
  }
  return data.signed_url;
}

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
  const objectPath =
    `${getPrivateObjectDir()}/chat/${householdId}/${randomUUID()}.${extension}`;
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
  const uploadUrl = await signObjectUrl(objectPath, "PUT", 15 * 60);
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.length),
    },
    body: bytes,
    signal: AbortSignal.timeout(60_000),
  });
  if (!uploadResponse.ok) {
    throw new Error(`Assistant image upload failed (${uploadResponse.status})`);
  }
  return { objectPath, mimeType, sizeBytes: bytes.length };
}

export function getChatAttachmentDownloadUrl(objectPath: string): Promise<string> {
  return signObjectUrl(objectPath, "GET", 5 * 60);
}

export async function deleteChatAttachment(objectPath: string): Promise<void> {
  const deleteUrl = await signObjectUrl(objectPath, "DELETE", 5 * 60);
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Assistant image deletion failed (${response.status})`);
  }
}