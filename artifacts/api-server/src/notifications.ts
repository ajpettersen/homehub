import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db } from "@workspace/db";
import { pushTokensTable, choresTable, maintenanceTasksTable, familyMembersTable } from "@workspace/db/schema";
import { lte, isNull, eq } from "drizzle-orm";
import { logger } from "./lib/logger";

const expo = new Expo();

// Track notifications already sent this server session to avoid duplicates.
// Key: `${token}:${type}:${id}:${dateStr}`
const sent = new Set<string>();

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

async function getAllTokens(): Promise<string[]> {
  const rows = await db.select({ token: pushTokensTable.token }).from(pushTokensTable);
  return rows.map((r) => r.token).filter(Expo.isExpoPushToken);
}

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
  const tokens = await getAllTokens();
  if (tokens.length === 0) return;

  const today = todayStr();
  const twoDaysOut = daysFromNow(2);
  const messages: ExpoPushMessage[] = [];

  // --- Chores due today or overdue, not yet completed ---
  try {
    const dueChores = await db
      .select({
        id: choresTable.id,
        title: choresTable.title,
        dueDate: choresTable.dueDate,
        assigneeName: familyMembersTable.name,
      })
      .from(choresTable)
      .leftJoin(familyMembersTable, eq(choresTable.assigneeId, familyMembersTable.id))
      .where(lte(choresTable.dueDate, today) as any);

    for (const chore of dueChores) {
      const isOverdue = chore.dueDate && chore.dueDate < today;
      const body = chore.assigneeName
        ? `${chore.assigneeName}'s chore${isOverdue ? " is overdue" : " is due today"}`
        : `Due${isOverdue ? " (overdue)" : " today"}`;

      for (const token of tokens) {
        const key = `${token}:chore:${chore.id}:${today}`;
        if (sent.has(key)) continue;
        sent.add(key);
        messages.push({
          to: token,
          title: `🧹 ${chore.title}`,
          body,
          data: { type: "chore", id: String(chore.id) },
          sound: "default",
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Error fetching due chores for notifications");
  }

  // --- Maintenance tasks due within 2 days ---
  try {
    const dueMaintenance = await db
      .select({
        id: maintenanceTasksTable.id,
        title: maintenanceTasksTable.title,
        nextDueDate: maintenanceTasksTable.nextDueDate,
        category: maintenanceTasksTable.category,
      })
      .from(maintenanceTasksTable)
      .where(lte(maintenanceTasksTable.nextDueDate, twoDaysOut) as any);

    for (const task of dueMaintenance) {
      const isToday = task.nextDueDate === today;
      const isTomorrow = task.nextDueDate === daysFromNow(1);
      const when = isToday ? "today" : isTomorrow ? "tomorrow" : "soon";

      for (const token of tokens) {
        const key = `${token}:maintenance:${task.id}:${today}`;
        if (sent.has(key)) continue;
        sent.add(key);
        messages.push({
          to: token,
          title: `🔧 ${task.title}`,
          body: `Home maintenance due ${when}`,
          data: { type: "maintenance", id: String(task.id) },
          sound: "default",
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Error fetching due maintenance tasks for notifications");
  }

  if (messages.length > 0) {
    logger.info({ count: messages.length }, "Sending due notifications");
    await sendMessages(messages);
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
