import { db, chatAttachmentCleanupQueueTable } from "@workspace/db";
import { and, asc, eq, lte, sql } from "drizzle-orm";

import { deleteChatAttachment } from "./chatAttachmentStorage";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;

async function finalizeQueuedChatAttachments(): Promise<void> {
  const queued = await db
    .select({ objectPath: chatAttachmentCleanupQueueTable.objectPath })
    .from(chatAttachmentCleanupQueueTable)
    .where(lte(chatAttachmentCleanupQueueTable.deleteAfter, new Date()))
    .orderBy(asc(chatAttachmentCleanupQueueTable.createdAt))
    .limit(CLEANUP_BATCH_SIZE);

  for (const item of queued) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtext(${`chat-attachment:${item.objectPath}`})
          )
        `);
        const [claim] = await tx
          .select({ objectPath: chatAttachmentCleanupQueueTable.objectPath })
          .from(chatAttachmentCleanupQueueTable)
          .where(and(
            eq(chatAttachmentCleanupQueueTable.objectPath, item.objectPath),
            lte(chatAttachmentCleanupQueueTable.deleteAfter, new Date()),
          ))
          .limit(1);
        if (!claim) return;
        await deleteChatAttachment(item.objectPath);
        await tx
          .delete(chatAttachmentCleanupQueueTable)
          .where(eq(chatAttachmentCleanupQueueTable.objectPath, item.objectPath));
      });
    } catch (err) {
      logger.warn({ err }, "Assistant attachment cleanup will be retried");
    }
  }
}

export function startChatAttachmentFinalizer(): void {
  const run = () => {
    void finalizeQueuedChatAttachments().catch((err) => {
      logger.error({ err }, "Failed to process assistant attachment cleanup queue");
    });
  };
  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
}