import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db, pool, webPushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";
import {
  buildDueNotificationMessages,
  buildDueWebPushMessages,
  type DeliveryDescriptor,
  type PlannedExpoPush,
  type PlannedWebPush,
} from "./notificationPlanner";
import { webPush } from "./lib/webPush";

const expo = new Expo();
const RECLAIM_AFTER_MINUTES = 15;

async function claimDelivery(delivery: DeliveryDescriptor): Promise<number | null> {
  const result = await pool.query<{ id: number }>(
    `WITH inserted AS (
       INSERT INTO notification_delivery
         (dedupe_key, household_id, recipient, channel, kind, entity_id, local_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id
     ), reclaimed AS (
       UPDATE notification_delivery
       SET claimed_at = now()
       WHERE dedupe_key = $1
         AND sent_at IS NULL
         AND claimed_at < now() - ($8 * interval '1 minute')
         AND NOT EXISTS (SELECT 1 FROM inserted)
       RETURNING id
     )
     SELECT id FROM inserted
     UNION ALL
     SELECT id FROM reclaimed
     LIMIT 1`,
    [
      delivery.dedupeKey,
      delivery.householdId,
      delivery.recipient,
      delivery.channel,
      delivery.kind,
      delivery.entityId,
      delivery.localDate,
      RECLAIM_AFTER_MINUTES,
    ],
  );
  return result.rows[0]?.id ?? null;
}

async function markSent(id: number): Promise<void> {
  await pool.query(
    "UPDATE notification_delivery SET sent_at = now() WHERE id = $1 AND sent_at IS NULL",
    [id],
  );
}

async function releaseClaim(id: number): Promise<void> {
  await pool.query(
    "UPDATE notification_delivery SET claimed_at = to_timestamp(0) WHERE id = $1 AND sent_at IS NULL",
    [id],
  );
}

async function sendExpoMessages(messages: PlannedExpoPush[]): Promise<void> {
  const claimed = (
    await Promise.all(messages.map(async (message) => ({
      message,
      deliveryId: await claimDelivery(message.delivery),
    })))
  ).filter(
    (value): value is { message: PlannedExpoPush; deliveryId: number } =>
      value.deliveryId !== null,
  );
  for (const chunk of expo.chunkPushNotifications(
    claimed.map(({ message }) => ({ ...message }) as ExpoPushMessage),
  )) {
    const matching = claimed.splice(0, chunk.length);
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      await Promise.all(tickets.map(async (ticket, index) => {
        const deliveryId = matching[index]?.deliveryId;
        if (!deliveryId) return;
        if (ticket.status === "ok") {
          await markSent(deliveryId);
        } else {
          await releaseClaim(deliveryId);
          logger.warn(
            { providerCode: ticket.details?.error },
            "Expo notification provider rejected a delivery",
          );
        }
      }));
    } catch {
      await Promise.all(matching.map(({ deliveryId }) => releaseClaim(deliveryId)));
      logger.error("Failed to send Expo notifications");
    }
  }
}

async function sendWebMessages(messages: PlannedWebPush[]): Promise<void> {
  await Promise.allSettled(messages.map(async (message) => {
    const deliveryId = await claimDelivery(message.delivery);
    if (deliveryId === null) return;
    try {
      await webPush.sendNotification(
        { endpoint: message.endpoint, keys: message.keys },
        JSON.stringify(message.payload),
        { TTL: 60 * 60 * 6, urgency: "normal" },
      );
      await markSent(deliveryId);
    } catch (error) {
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(webPushSubscriptionsTable)
          .where(eq(webPushSubscriptionsTable.id, message.subscriptionId));
      } else {
        await releaseClaim(deliveryId);
        logger.error(
          { statusCode, subscriptionId: message.subscriptionId },
          "Failed to send Web Push notification",
        );
      }
    }
  }));
}

export async function sendDueNotifications(): Promise<void> {
  try {
    const now = new Date();
    const [expoMessages, webMessages] = await Promise.all([
      buildDueNotificationMessages(now),
      buildDueWebPushMessages(now),
    ]);
    if (expoMessages.length === 0 && webMessages.length === 0) return;
    logger.info(
      { expoCount: expoMessages.length, webCount: webMessages.length },
      "Processing due notifications",
    );
    await Promise.all([
      sendExpoMessages(expoMessages),
      sendWebMessages(webMessages),
    ]);
  } catch (error) {
    logger.error(
      { errorName: error instanceof Error ? error.name : "unknown" },
      "Error processing due notifications",
    );
  }
}

/** Start promptly, then poll often enough to honor household-local reminder times. */
export function startNotificationScheduler(): void {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  setTimeout(() => void sendDueNotifications(), 5000);
  setInterval(() => void sendDueNotifications(), FIVE_MINUTES_MS);
  logger.info("Notification scheduler started");
}