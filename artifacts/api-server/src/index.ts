import app from "./app";
import { logger } from "./lib/logger";
import { fixStaleMaintenanceDates, fixStaleChoreDates } from "./seed";
import { runOneTimeProdCleanup } from "./prodDataRepair";
import { startNotificationScheduler } from "./notifications";
import { ensureWebPushSchema } from "./lib/webPush";
import { startChatAttachmentFinalizer } from "./lib/chatAttachmentFinalizer";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await ensureWebPushSchema();

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Note: demo data is intentionally NOT seeded on startup. A fresh database
  // stays empty so the onboarding wizard is the single source of initial data
  // (seeding defaults here caused duplicate families in new installs).
  // seedRecurringMaintenanceTasks was removed for the same reason: it
  // auto-inserted a large curated task list onto any house+cabin property
  // pair on every boot, which would re-pollute cleaned households.
  await runOneTimeProdCleanup();
  await fixStaleMaintenanceDates();
  await fixStaleChoreDates();
  startNotificationScheduler();
  startChatAttachmentFinalizer();
});
