import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { logger } from "./lib/logger";
import { db, webPushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  buildDueNotificationMessages,
  buildDueWebPushMessages,
  type PlannedWebPush,
} from "./notificationPlanner";
import { webPush } from "./lib/webPush";

const expo = new Expo();

// Track notifications already sent this server session to avoid duplicates.
// Key: `${token}:${type}:${id}:${dateStr}`
const sent = new Set<string>();

async function sendMessages(messages: ExpoPushMessage[]) {
  if (messages.length === 0) return;
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === "error") {
          logger.warn({ ticket }, "Push notification error");
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to send push notifications");
    }
  }
}

async function sendWebMessages(messages: PlannedWebPush[]) {
  await Promise.allSettled(
    messages.map(async (message) => {
      try {
        await webPush.sendNotification(
          { endpoint: message.endpoint, keys: message.keys },
          JSON.stringify(message.payload),
          { TTL: 60 * 60 * 6, urgency: "normal" },
        );
      } catch (err) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number(err.statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(webPushSubscriptionsTable)
            .where(eq(webPushSubscriptionsTable.id, message.subscriptionId));
          return;
        }
        logger.error(
          { err, subscriptionId: message.subscriptionId },
          "Failed to send Web Push notification",
        );
      }
    }),
  );
}

export async function sendDueNotifications() {
  try {
    const now = new Date();
    const [expoMessages, webMessages] = await Promise.all([
      buildDueNotificationMessages(now, sent),
      buildDueWebPushMessages(now, sent),
    ]);
    if (expoMessages.length === 0 && webMessages.length === 0) return;
    logger.info(
      { expoCount: expoMessages.length, webCount: webMessages.length },
      "Sending due notifications",
    );
    await Promise.all([sendMessages(expoMessages), sendWebMessages(webMessages)]);
  } catch (err) {
    logger.error({ err }, "Error building due notifications");
  }
}

/** Start the notification scheduler. Runs immediately, then every hour. */
export function startNotificationScheduler() {
  const HOUR_MS = 60 * 60 * 1000;

  const runIfDaytime = async () => {
    const hour = new Date().getHours();
    // Only notify between 7am and 9pm local server time
    if (hour >= 7 && hour < 21) {
      await sendDueNotifications();
    }
  };

  // Run once at startup after a short delay (let DB settle)
  setTimeout(runIfDaytime, 5000);

  // Then every hour
  setInterval(runIfDaytime, HOUR_MS);

  logger.info("Notification scheduler started");
}
