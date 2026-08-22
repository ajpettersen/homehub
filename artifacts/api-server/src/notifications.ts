import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { logger } from "./lib/logger";
import { buildDueNotificationMessages } from "./notificationPlanner";

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

export async function sendDueNotifications() {
  try {
    const messages = await buildDueNotificationMessages(new Date(), sent);
    if (messages.length === 0) return;
    logger.info({ count: messages.length }, "Sending due notifications");
    await sendMessages(messages);
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
