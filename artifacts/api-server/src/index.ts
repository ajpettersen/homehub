import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty, seedChoresIfEmpty, fixStaleMaintenanceDates, ensureHouseCleanerTasks, seedCleanerIfEmpty } from "./seed";
import { seedRecurringMaintenanceTasks } from "./seedMaintenance";
import { startNotificationScheduler } from "./notifications";

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

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  await seedIfEmpty();
  await seedChoresIfEmpty();
  await fixStaleMaintenanceDates();
  await ensureHouseCleanerTasks();
  await seedCleanerIfEmpty();
  await seedRecurringMaintenanceTasks();
  startNotificationScheduler();
});
