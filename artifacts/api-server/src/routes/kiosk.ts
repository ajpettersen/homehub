import { Router } from "express";
import {
  db,
  choresTable,
  familyMembersTable,
  kioskPhotosTable,
  maintenanceTasksTable,
  mealPlansTable,
  propertiesTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  KIOSK_COOKIE_MAX_AGE_MS,
  KIOSK_COOKIE_NAME,
  createKioskCookieValue,
  getKioskScope,
  getPairingKey,
  keyMatches,
  pairingLocked,
  recordPairingFailure,
  requireKioskPairing,
} from "../lib/kioskAccess";
import { getKioskCalendar, getKioskWeather, parseCalendarSources } from "../lib/kioskFeeds";
import { addMaintenanceDays, dateInMaintenanceTimeZone, resolveMaintenanceTimeZone } from "../lib/maintenanceDates";
import { markChoreComplete } from "./chores";

const router = Router();

// Meal plan weeks start Monday everywhere (see CLAUDE.md "Data model gotchas").
function mondayOf(dateOnly: string): string {
  const day = new Date(`${dateOnly}T00:00:00Z`).getUTCDay();
  return addMaintenanceDays(dateOnly, day === 0 ? -6 : 1 - day);
}

router.post("/kiosk/pair", (req, res) => {
  const key = getPairingKey();
  if (!key) {
    res.status(503).json({ code: "not_configured", error: "The wall screen isn't set up yet. Add KIOSK_PAIRING_KEY (16+ characters) in Railway." });
    return;
  }
  if (pairingLocked()) {
    res.status(429).json({ error: "Too many wrong keys. Wait ten minutes and try again." });
    return;
  }
  if (!keyMatches(req.body?.key, key)) {
    recordPairingFailure();
    res.status(401).json({ error: "That key isn't right." });
    return;
  }
  res.cookie(KIOSK_COOKIE_NAME, createKioskCookieValue(key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/kiosk",
    maxAge: KIOSK_COOKIE_MAX_AGE_MS,
  });
  res.json({ ok: true });
});

// The wall screen can show household info and check off chores, nothing else.
// Settings and every other change belong in the app, so a stolen or shared
// screen can't do much damage.
router.get("/kiosk/summary", requireKioskPairing, async (req, res) => {
  try {
    const scope = getKioskScope(res);
    const timeZone = resolveMaintenanceTimeZone(req.query.timezone);
    if (!timeZone) {
      res.status(400).json({ error: "Invalid timezone" });
      return;
    }
    const today = dateInMaintenanceTimeZone(timeZone);
    const weekStart = mondayOf(today);
    const weekEnd = addMaintenanceDays(weekStart, 6);
    const inThirtyDays = addMaintenanceDays(today, 30);

    const calendarSources = parseCalendarSources(process.env.KIOSK_CALENDAR_ICS_URLS);
    const latitude = Number(process.env.KIOSK_LATITUDE);
    const longitude = Number(process.env.KIOSK_LONGITUDE);
    const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude)
      && !!process.env.KIOSK_LATITUDE && !!process.env.KIOSK_LONGITUDE;

    const noProperties = scope.propertyIds.length === 0;
    const [members, chores, maintenance, meals, calendar, weather, photo] = await Promise.all([
      db.select({
        id: familyMembersTable.id,
        name: familyMembersTable.name,
        color: familyMembersTable.color,
        initials: familyMembersTable.avatarInitials,
      }).from(familyMembersTable).where(eq(familyMembersTable.householdId, scope.householdId)),
      noProperties ? [] : db.select({
        id: choresTable.id,
        title: choresTable.title,
        assigneeId: choresTable.assigneeId,
        dueDate: choresTable.dueDate,
        points: choresTable.points,
        status: choresTable.status,
      }).from(choresTable).where(and(
        inArray(choresTable.propertyId, scope.propertyIds),
        isNull(choresTable.completedAt),
        lte(choresTable.dueDate, today),
      )).orderBy(choresTable.dueDate).limit(40),
      noProperties ? [] : db.select({
        id: maintenanceTasksTable.id,
        title: maintenanceTasksTable.title,
        nextDueDate: maintenanceTasksTable.nextDueDate,
        propertyName: propertiesTable.name,
      }).from(maintenanceTasksTable)
        .leftJoin(propertiesTable, eq(maintenanceTasksTable.propertyId, propertiesTable.id))
        .where(and(
          inArray(maintenanceTasksTable.propertyId, scope.propertyIds),
          lte(maintenanceTasksTable.nextDueDate, inThirtyDays),
          or(ne(maintenanceTasksTable.scheduleType, "one-time"), eq(maintenanceTasksTable.isCompleted, false)),
        ))
        .orderBy(maintenanceTasksTable.nextDueDate).limit(12),
      noProperties ? [] : db.select({
        id: mealPlansTable.id,
        dayOfWeek: mealPlansTable.dayOfWeek,
        mealType: mealPlansTable.mealType,
        meal: mealPlansTable.meal,
      }).from(mealPlansTable).where(and(
        inArray(mealPlansTable.propertyId, scope.propertyIds),
        eq(mealPlansTable.weekStart, weekStart),
      )),
      calendarSources.length > 0
        ? getKioskCalendar(calendarSources).catch(() => ({ events: [], errors: calendarSources.map(source => source.label) }))
        : Promise.resolve(null),
      hasLocation ? getKioskWeather(latitude, longitude) : Promise.resolve(null),
      db.select({ updatedAt: kioskPhotosTable.updatedAt }).from(kioskPhotosTable)
        .where(eq(kioskPhotosTable.householdId, scope.householdId)).then(rows => rows[0] ?? null)
        // A missing photo should never take the whole screen down.
        .catch(() => null),
    ]);

    const memberById = new Map(members.map(member => [member.id, member]));
    res.json({
      householdName: scope.householdName,
      today,
      weekStart,
      weekEnd,
      weather,
      // Changes whenever the photo does, so the screen can cache it by URL.
      photoVersion: photo ? String(photo.updatedAt.getTime()) : null,
      meals: meals.map(meal => ({ ...meal, id: String(meal.id) })),
      chores: chores.map(chore => {
        const assignee = chore.assigneeId ? memberById.get(chore.assigneeId) : undefined;
        return {
          id: String(chore.id),
          title: chore.title,
          assigneeName: assignee?.name ?? null,
          assigneeColor: assignee?.color ?? null,
          assigneeInitials: assignee?.initials ?? null,
          dueDate: chore.dueDate,
          isOverdue: !!chore.dueDate && chore.dueDate < today,
          points: chore.points,
          awaitingApproval: chore.status === "pending",
        };
      }),
      maintenance: maintenance.map(task => ({
        id: String(task.id),
        title: task.title,
        propertyName: task.propertyName ?? "",
        nextDueDate: task.nextDueDate,
        isOverdue: task.nextDueDate < today,
      })),
      calendar: calendar === null
        ? { configured: false, events: [], failedCalendars: [] }
        : { configured: true, events: calendar.events, failedCalendars: calendar.errors },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build kiosk summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Checking off a chore from the wall. Paid chores still wait for a parent to
// approve them in the app, so this never moves money by itself.
router.post("/kiosk/chores/:id/complete", requireKioskPairing, async (req, res) => {
  try {
    const scope = getKioskScope(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [chore] = scope.propertyIds.length === 0 ? [] : await db.select({
      assigneeName: familyMembersTable.name,
    }).from(choresTable)
      .leftJoin(familyMembersTable, eq(choresTable.assigneeId, familyMembersTable.id))
      .where(and(eq(choresTable.id, id), inArray(choresTable.propertyId, scope.propertyIds), isNull(choresTable.completedAt)));
    if (!chore) {
      res.status(404).json({ error: "That chore is already done or gone." });
      return;
    }
    const result = await markChoreComplete(id, scope.propertyIds, chore.assigneeName ?? "Wall screen", null);
    if (result.kind === "missing") {
      res.status(404).json({ error: "That chore is already done or gone." });
      return;
    }
    if (result.kind === "conflict") {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json({ ok: true, status: result.status });
  } catch (err) {
    req.log.error({ err }, "Failed to complete chore from the wall screen");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/kiosk/photo", requireKioskPairing, async (req, res) => {
  try {
    const scope = getKioskScope(res);
    const [photo] = await db.select({ mimeType: kioskPhotosTable.mimeType, bytes: kioskPhotosTable.bytes })
      .from(kioskPhotosTable).where(eq(kioskPhotosTable.householdId, scope.householdId));
    if (!photo) {
      res.status(404).end();
      return;
    }
    // The screen asks for ?v=<photoVersion>, so a new photo gets a new URL.
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.type(photo.mimeType).send(photo.bytes);
  } catch (err) {
    req.log.error({ err }, "Failed to load kiosk photo");
    res.status(500).end();
  }
});

export default router;
