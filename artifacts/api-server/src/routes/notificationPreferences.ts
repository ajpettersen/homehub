import { Router } from "express";
import {
  db,
  householdNotificationPreferencesTable,
  workoutPreferencesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getApprovedHouseholdScope,
  requireApprovedLinkedAdult,
} from "../middlewares/requireApprovedHousehold";

const router = Router();
const TIME_PATTERN = /^(?:(?:0[5-9]|1\d):[0-5]\d|20:[0-5][0-5])$/;
const DEFAULTS = {
  timezone: "UTC",
  dueReminderTime: "08:00",
  workoutFollowUpTime: "08:00",
} as const;

function validTimezone(value: string): boolean {
  if (value.length < 1 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function responseValue(
  row: typeof householdNotificationPreferencesTable.$inferSelect | undefined,
  legacyTimezone?: string,
) {
  return {
    timezone: row?.timezone ?? legacyTimezone ?? DEFAULTS.timezone,
    dueReminderTime: row?.dueReminderTime ?? DEFAULTS.dueReminderTime,
    workoutFollowUpTime: row?.workoutFollowUpTime ?? DEFAULTS.workoutFollowUpTime,
  };
}

router.get("/notification-preferences", async (_req, res): Promise<void> => {
  const scope = getApprovedHouseholdScope(res);
  const [[row], [legacy]] = await Promise.all([
    db.select().from(householdNotificationPreferencesTable)
      .where(eq(householdNotificationPreferencesTable.householdId, scope.householdId))
      .limit(1),
    db.select({ timezone: workoutPreferencesTable.timezone })
      .from(workoutPreferencesTable)
      .where(eq(workoutPreferencesTable.householdId, scope.householdId))
      .limit(1),
  ]);
  res.json(responseValue(row, legacy?.timezone));
});

router.put("/notification-preferences", async (req, res): Promise<void> => {
  const scope = requireApprovedLinkedAdult(res);
  if (!scope) return;
  const body = req.body as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.timezone !== "string" ||
    !validTimezone(body.timezone)
  ) {
    res.status(400).json({
      error: "timezone must be a valid IANA timezone",
    });
    return;
  }
  if (
    typeof body.dueReminderTime !== "string" ||
    !TIME_PATTERN.test(body.dueReminderTime) ||
    typeof body.workoutFollowUpTime !== "string" ||
    !TIME_PATTERN.test(body.workoutFollowUpTime)
  ) {
    res.status(400).json({
      error: "reminder times must be HH:MM between 05:00 and 20:55 local time",
    });
    return;
  }

  const [saved] = await db
    .insert(householdNotificationPreferencesTable)
    .values({
      householdId: scope.householdId,
      timezone: body.timezone,
      dueReminderTime: body.dueReminderTime,
      workoutFollowUpTime: body.workoutFollowUpTime,
    })
    .onConflictDoUpdate({
      target: householdNotificationPreferencesTable.householdId,
      set: {
        timezone: body.timezone,
        dueReminderTime: body.dueReminderTime,
        workoutFollowUpTime: body.workoutFollowUpTime,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json(responseValue(saved));
});

export default router;