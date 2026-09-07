import { Router } from "express";
import {
  db,
  exerciseLibraryTable,
  familyMembersTable,
  MUSCLE_GROUPS,
  workoutCoachMessagesTable,
  workoutExercisesTable,
  workoutParticipantsTable,
  workoutPreferencesTable,
  workoutsTable,
} from "@workspace/db";
import {
  AddExerciseBody,
  CreateLibraryExerciseBody,
  CreateWorkoutBody,
  CompleteWorkoutSessionBody,
  DraftWorkoutBody,
  DraftWorkoutResponse,
  GenerateWorkoutWeekPlanBody,
  GenerateWorkoutWeekPlanResponse,
  SaveWorkoutWeekPlanBody,
  SendWorkoutCoachMessageBody,
  ScheduleWorkoutSessionBody,
  UpdateWorkoutSessionStatusBody,
  RescheduleWorkoutSessionBody,
  UpdateLibraryExerciseBody,
  UpdateWorkoutBody,
  UpdateWorkoutPreferencesBody,
} from "@workspace/api-zod";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();
const muscleGroups = new Set<string>(MUSCLE_GROUPS);

function id(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function dateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`))) return null;
  return match[1];
}

function exactDateOnlyString(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function badRequest(res: any, message: string, details?: unknown) {
  res.status(400).json({ error: message, ...(details ? { details } : {}) });
}

async function validateAdultIds(
  database: any,
  values: unknown[],
  householdId: number,
): Promise<Array<typeof familyMembersTable.$inferSelect> | null> {
  const ids = [...new Set(values.map(id).filter((value): value is number => value !== null))];
  if (ids.length !== values.length || ids.length === 0) return null;
  const members: Array<typeof familyMembersTable.$inferSelect> = await database.select().from(familyMembersTable).where(and(
    inArray(familyMembersTable.id, ids),
    eq(familyMembersTable.householdId, householdId),
    eq(familyMembersTable.role, "parent"),
  ));
  if (members.length !== ids.length) return null;
  return ids.map(memberId => members.find(member => member.id === memberId)!);
}

async function participantsFor(workoutIds: number[]) {
  if (!workoutIds.length) return new Map<number, Array<{ id: string; name: string; color: string }>>();
  const rows = await db.select({
    workoutId: workoutParticipantsTable.workoutId,
    id: familyMembersTable.id,
    name: familyMembersTable.name,
    color: familyMembersTable.color,
  }).from(workoutParticipantsTable)
    .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
    .where(inArray(workoutParticipantsTable.workoutId, workoutIds))
    .orderBy(asc(workoutParticipantsTable.createdAt));
  const result = new Map<number, Array<{ id: string; name: string; color: string }>>();
  for (const row of rows) {
    const list = result.get(row.workoutId) ?? [];
    list.push({ id: String(row.id), name: row.name, color: row.color });
    result.set(row.workoutId, list);
  }
  return result;
}

async function authorizedWorkout(workoutId: number, householdId: number) {
  const [row] = await db.select({ workout: workoutsTable })
    .from(workoutsTable)
    .innerJoin(workoutParticipantsTable, eq(workoutsTable.id, workoutParticipantsTable.workoutId))
    .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
    .where(and(eq(workoutsTable.id, workoutId), eq(familyMembersTable.householdId, householdId)))
    .limit(1);
  return row?.workout ?? null;
}

async function exerciseRows(workoutId: number) {
  return db.select().from(workoutExercisesTable)
    .where(eq(workoutExercisesTable.workoutId, workoutId))
    .orderBy(asc(workoutExercisesTable.id));
}

function formatExercise(exercise: typeof workoutExercisesTable.$inferSelect) {
  return {
    id: String(exercise.id),
    workoutId: String(exercise.workoutId),
    libraryExerciseId: exercise.libraryExerciseId ? String(exercise.libraryExerciseId) : null,
    name: exercise.name,
    muscleGroups: exercise.muscleGroups,
    sets: exercise.sets,
    reps: exercise.reps,
    weightLbs: exercise.weightLbs,
    durationSeconds: exercise.durationSeconds,
    notes: exercise.notes,
  };
}

async function formatWorkout(workout: typeof workoutsTable.$inferSelect, includeExercises = false) {
  const participantMap = await participantsFor([workout.id]);
  const participants = participantMap.get(workout.id) ?? [];
  const exercises = await exerciseRows(workout.id);
  return {
    id: String(workout.id),
    memberId: participants[0]?.id ?? String(workout.memberId),
    memberName: participants[0]?.name ?? "",
    participantIds: participants.map(participant => participant.id),
    participants,
    workoutDate: workout.workoutDate,
    scheduledDate: workout.scheduledDate,
    scheduledTime: workout.scheduledTime,
    scheduledTimezone: workout.scheduledTimezone,
    sessionStatus: workout.sessionStatus,
    sessionKind: workout.sessionKind,
    completedAt: workout.completedAt?.toISOString() ?? null,
    followUpDismissedAt: workout.followUpDismissedAt?.toISOString() ?? null,
    rescheduledFromWorkoutId: workout.rescheduledFromWorkoutId ? String(workout.rescheduledFromWorkoutId) : null,
    title: workout.title,
    durationMinutes: workout.durationMinutes,
    notes: workout.notes,
    ...(includeExercises
      ? { exercises: exercises.map(formatExercise) }
      : { exerciseCount: exercises.length }),
    createdAt: workout.createdAt.toISOString(),
  };
}

async function ensureLibraryExercise(
  tx: any,
  householdId: number,
  name: string,
  groups: string[],
) {
  const normalizedName = normalizeName(name);
  const [item] = await tx.insert(exerciseLibraryTable).values({
    householdId,
    name: name.trim(),
    normalizedName,
    muscleGroups: groups,
  }).onConflictDoUpdate({
    target: [exerciseLibraryTable.householdId, exerciseLibraryTable.normalizedName],
    set: { name: name.trim(), muscleGroups: groups, updatedAt: new Date() },
  }).returning();
  return item;
}

async function insertExercises(tx: any, workoutId: number, householdId: number, exercises: any[]) {
  for (const exercise of exercises) {
    const library = await ensureLibraryExercise(tx, householdId, exercise.name, exercise.muscleGroups);
    await tx.insert(workoutExercisesTable).values({
      workoutId,
      libraryExerciseId: library.id,
      name: library.name,
      muscleGroups: library.muscleGroups,
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      weightLbs: exercise.weightLbs ?? null,
      durationSeconds: exercise.durationSeconds ?? null,
      notes: exercise.notes ?? null,
    });
  }
}

// An obvious duplicate is the same household, date-only value, normalized title,
// and complete participant set. The lock serializes that identity without
// preventing distinct same-day sessions for different participants or titles.
async function lockWorkoutDate(tx: any, householdId: number, workoutDate: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`workout-date:${householdId}:${workoutDate}`}))`);
}

async function assertNoWorkoutDuplicate(
  tx: any,
  householdId: number,
  workoutDate: string,
  title: string,
  participantIds: number[],
  excludeWorkoutId?: number,
) {
  const rows = await tx.execute(sql`
    SELECT w.id, array_agg(wp.member_id ORDER BY wp.member_id)::text AS participant_ids
    FROM workouts w
    JOIN workout_participants wp ON wp.workout_id = w.id
    JOIN family_members fm ON fm.id = wp.member_id
    WHERE fm.household_id = ${householdId}
      AND w.workout_date = ${workoutDate}
      AND lower(trim(w.title)) = lower(trim(${title}))
      AND (${excludeWorkoutId ?? 0} = 0 OR w.id <> ${excludeWorkoutId ?? 0})
    GROUP BY w.id
  `);
  const expected = [...participantIds].sort((a, b) => a - b).join(",");
  if (rows.rows.some((row: any) => String(row.participant_ids).replace(/[{}]/g, "") === expected)) {
    throw new Error("DUPLICATE");
  }
}

router.get("/workouts", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const requested = req.query.memberId === undefined ? null : id(req.query.memberId);
    if (req.query.memberId !== undefined && !requested) return badRequest(res, "Invalid memberId");
    if (requested && !(await validateAdultIds(db, [requested], scope.householdId))) {
      res.status(404).json({ error: "Adult participant not found" });
      return;
    }
    const rows = await db.selectDistinct({ workout: workoutsTable })
      .from(workoutsTable)
      .innerJoin(workoutParticipantsTable, eq(workoutsTable.id, workoutParticipantsTable.workoutId))
      .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
      .where(and(
        eq(familyMembersTable.householdId, scope.householdId),
        ...(requested ? [eq(workoutParticipantsTable.memberId, requested)] : []),
      ))
      .orderBy(desc(workoutsTable.workoutDate), desc(workoutsTable.createdAt));
    res.json(await Promise.all(rows.map(row => formatWorkout(row.workout))));
  } catch (err) {
    req.log.error({ err }, "Failed to list workouts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/workouts", async (req, res) => {
  const parsed = CreateWorkoutBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid workout", parsed.error.flatten());
  const participantIds = parsed.data.participantIds?.length
    ? parsed.data.participantIds
    : parsed.data.memberId ? [parsed.data.memberId] : [];
  const workoutDate = dateOnly(parsed.data.workoutDate);
  if (!workoutDate || !participantIds.length) return badRequest(res, "participantIds are required");
  try {
    const scope = getApprovedHouseholdScope(res);
    const members = await validateAdultIds(db, participantIds, scope.householdId);
    if (!members) return badRequest(res, "Every participant must be a unique active adult in this household");
    const workout = await db.transaction(async tx => {
      await lockWorkoutDate(tx, scope.householdId, workoutDate);
      await assertNoWorkoutDuplicate(tx, scope.householdId, workoutDate, parsed.data.title, members.map(member => member.id));
      const [created] = await tx.insert(workoutsTable).values({
        memberId: members[0].id,
        title: parsed.data.title.trim(),
        workoutDate,
        durationMinutes: parsed.data.durationMinutes ?? null,
        notes: parsed.data.notes ?? null,
        completedAt: new Date(),
      }).returning();
      await tx.insert(workoutParticipantsTable).values(members.map(member => ({
        workoutId: created.id,
        memberId: member.id,
      })));
      return created;
    });
    res.status(201).json(await formatWorkout(workout));
  } catch (err) {
    if ((err as Error).message === "DUPLICATE") return res.status(409).json({ error: "An identical workout is already logged for these participants and date" });
    req.log.error({ err }, "Failed to create workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/workouts/:id", async (req, res) => {
  const workoutId = id(req.params.id);
  if (!workoutId) return badRequest(res, "Invalid workout id");
  try {
    const workout = await authorizedWorkout(workoutId, getApprovedHouseholdScope(res).householdId);
    if (!workout) return res.status(404).json({ error: "Workout not found" });
    res.json(await formatWorkout(workout, true));
  } catch (err) {
    req.log.error({ err }, "Failed to get workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/workouts/:id", async (req, res) => {
  const workoutId = id(req.params.id);
  if (!workoutId) return badRequest(res, "Invalid workout id");
  const parsed = UpdateWorkoutBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid workout update", parsed.error.flatten());
  try {
    const scope = getApprovedHouseholdScope(res);
    const existing = await authorizedWorkout(workoutId, scope.householdId);
    if (!existing) return res.status(404).json({ error: "Workout not found" });
    if (existing.sessionStatus === "scheduled") {
      return badRequest(res, "Scheduled workouts must be changed through the session reschedule endpoint");
    }
    const replacementMembers = parsed.data.participantIds
      ? await validateAdultIds(db, parsed.data.participantIds, scope.householdId)
      : null;
    if (parsed.data.participantIds && !replacementMembers) {
      return badRequest(res, "Every participant must be a unique active adult in this household");
    }
    const workoutDate = parsed.data.workoutDate ? dateOnly(parsed.data.workoutDate) : undefined;
    const updated = await db.transaction(async tx => {
      const [locked] = await tx.select({ workout: workoutsTable }).from(workoutsTable)
        .innerJoin(workoutParticipantsTable, eq(workoutsTable.id, workoutParticipantsTable.workoutId))
        .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
        .where(and(eq(workoutsTable.id, workoutId), eq(familyMembersTable.householdId, scope.householdId)))
        .for("update").limit(1);
      if (!locked) throw new Error("MISSING");
      const resultingDate = workoutDate ?? locked.workout.workoutDate;
      const resultingTitle = parsed.data.title?.trim() ?? locked.workout.title;
      const currentParticipants = await tx.select({ memberId: workoutParticipantsTable.memberId })
        .from(workoutParticipantsTable)
        .where(eq(workoutParticipantsTable.workoutId, workoutId))
        .for("update");
      const members = replacementMembers ?? await validateAdultIds(
        tx,
        currentParticipants.map(participant => participant.memberId),
        scope.householdId,
      );
      if (!members) throw new Error("INVALID_PARTICIPANTS");
      // Lock dates in a stable order, so two edits that move workouts across
      // dates cannot deadlock and duplicate detection sees a serialized view.
      for (const date of [...new Set([locked.workout.workoutDate, resultingDate])].sort()) {
        await lockWorkoutDate(tx, scope.householdId, date);
      }
      await assertNoWorkoutDuplicate(
        tx,
        scope.householdId,
        resultingDate,
        resultingTitle,
        members.map(member => member.id),
        workoutId,
      );
      if (replacementMembers) {
        await tx.delete(workoutParticipantsTable).where(eq(workoutParticipantsTable.workoutId, workoutId));
        await tx.insert(workoutParticipantsTable).values(members.map(member => ({
          workoutId,
          memberId: member.id,
        })));
      }
      const [row] = await tx.update(workoutsTable).set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
        ...(workoutDate ? { workoutDate } : {}),
        ...(parsed.data.durationMinutes !== undefined ? { durationMinutes: parsed.data.durationMinutes } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        ...(replacementMembers ? { memberId: members[0].id } : {}),
      }).where(eq(workoutsTable.id, workoutId)).returning();
      return row;
    });
    res.json(await formatWorkout(updated, true));
  } catch (err) {
    if ((err as Error).message === "DUPLICATE") return res.status(409).json({ error: "An identical workout is already logged for these participants and date" });
    if ((err as Error).message === "MISSING") return res.status(404).json({ error: "Workout not found" });
    if ((err as Error).message === "INVALID_PARTICIPANTS") return badRequest(res, "Every participant must be a unique active adult in this household");
    req.log.error({ err }, "Failed to update workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/workouts/:id", async (req, res) => {
  const workoutId = id(req.params.id);
  if (!workoutId) return badRequest(res, "Invalid workout id");
  try {
    const scope = getApprovedHouseholdScope(res);
    if (!(await authorizedWorkout(workoutId, scope.householdId))) {
      return res.status(404).json({ error: "Workout not found" });
    }
    await db.delete(workoutsTable).where(eq(workoutsTable.id, workoutId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/workout-sessions", async (req, res) => {
  const weekStart = dateOnly(req.query.weekStart);
  if (!weekStart) return badRequest(res, "weekStart must be a date-only value");
  const memberId = req.query.memberId === undefined ? null : id(req.query.memberId);
  if (req.query.memberId !== undefined && !memberId) return badRequest(res, "Invalid memberId");
  const weekEnd = new Date(`${weekStart}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  try {
    const scope = getApprovedHouseholdScope(res);
    if (memberId && !(await validateAdultIds(db, [memberId], scope.householdId))) {
      res.status(404).json({ error: "Adult participant not found" });
      return;
    }
    // PostgreSQL requires every DISTINCT ordering expression in the select
    // list. The explicit sort column preserves one row per workout despite
    // the participant authorization join.
    const sessionDateExpression = sql<string>`COALESCE(${workoutsTable.scheduledDate}, ${workoutsTable.workoutDate})`;
    const sessionDate = sessionDateExpression.as("session_date");
    const rows = await db.selectDistinct({ workout: workoutsTable, sessionDate }).from(workoutsTable)
      .innerJoin(workoutParticipantsTable, eq(workoutsTable.id, workoutParticipantsTable.workoutId))
      .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
      .where(and(eq(familyMembersTable.householdId, scope.householdId),
        ...(memberId ? [eq(workoutParticipantsTable.memberId, memberId)] : []),
        gte(sessionDateExpression, weekStart),
        lt(sessionDateExpression, weekEnd.toISOString().slice(0, 10)),
      )).orderBy(asc(sessionDate), asc(workoutsTable.id));
    res.json(await Promise.all(rows.map(row => formatWorkout(row.workout))));
  } catch (err) {
    req.log.error({ err }, "Failed to list workout sessions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/workout-sessions/overdue", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const [preferences] = await db.select().from(workoutPreferencesTable)
      .where(eq(workoutPreferencesTable.householdId, scope.householdId)).limit(1);
    const today = householdDates(preferences?.timezone ?? "UTC").currentLocalDate;
    const rows = await db.selectDistinct({ workout: workoutsTable }).from(workoutsTable)
      .innerJoin(workoutParticipantsTable, eq(workoutsTable.id, workoutParticipantsTable.workoutId))
      .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
      .where(and(eq(familyMembersTable.householdId, scope.householdId), eq(workoutsTable.sessionStatus, "scheduled"),
        lt(workoutsTable.scheduledDate, today), isNull(workoutsTable.followUpDismissedAt)))
      .orderBy(asc(workoutsTable.scheduledDate));
    res.json(await Promise.all(rows.map(row => formatWorkout(row.workout))));
  } catch (err) {
    req.log.error({ err }, "Failed to list overdue workout sessions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/workout-sessions", async (req, res) => {
  const parsed = ScheduleWorkoutSessionBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid workout session", parsed.error.flatten());
  const scheduledDate = dateOnly(parsed.data.scheduledDate);
  if (!scheduledDate) return badRequest(res, "scheduledDate must be a date-only value");
  try {
    Intl.DateTimeFormat(undefined, { timeZone: parsed.data.scheduledTimezone });
    const scope = getApprovedHouseholdScope(res);
    const members = await validateAdultIds(db, parsed.data.participantIds, scope.householdId);
    if (!members) return badRequest(res, "Every participant must be a unique active adult in this household");
    const workout = await db.transaction(async tx => {
      await lockWorkoutDate(tx, scope.householdId, scheduledDate);
      await assertNoWorkoutDuplicate(tx, scope.householdId, scheduledDate, parsed.data.title, members.map(member => member.id));
      const [created] = await tx.insert(workoutsTable).values({
        memberId: members[0].id, title: parsed.data.title.trim(), workoutDate: scheduledDate,
        scheduledDate, scheduledTime: parsed.data.scheduledTime ?? null, scheduledTimezone: parsed.data.scheduledTimezone,
        sessionStatus: "scheduled", sessionKind: "ad_hoc", durationMinutes: parsed.data.durationMinutes ?? null, notes: parsed.data.notes ?? null,
      }).returning();
      await tx.insert(workoutParticipantsTable).values(members.map(member => ({ workoutId: created.id, memberId: member.id })));
      if (parsed.data.exercises?.length) await insertExercises(tx, created.id, scope.householdId, parsed.data.exercises);
      return created;
    });
    res.status(201).json(await formatWorkout(workout, true));
  } catch (err) {
    if ((err as Error).message === "DUPLICATE") return res.status(409).json({ error: "An identical workout is already scheduled for these participants and date" });
    req.log.error({ err }, "Failed to schedule workout session");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/workout-sessions/:id/complete", async (req, res) => {
  const workoutId = id(req.params.id);
  const parsed = CompleteWorkoutSessionBody.safeParse(req.body);
  if (!workoutId || !parsed.success) return badRequest(res, "Invalid workout completion");
  try {
    const scope = getApprovedHouseholdScope(res);
    const existing = await authorizedWorkout(workoutId, scope.householdId);
    if (!existing) { res.status(404).json({ error: "Workout not found" }); return; }
    if (existing.sessionStatus === "completed") {
      res.json(await formatWorkout(existing, true));
      return;
    }
    if (existing.sessionStatus !== "scheduled") return badRequest(res, "Only scheduled workouts can be completed");
    const completedAt = parsed.data.completedAt ? new Date(parsed.data.completedAt) : new Date();
    if (Number.isNaN(completedAt.valueOf())) return badRequest(res, "completedAt must be a valid timestamp");
    const [updated] = await db.update(workoutsTable).set({ sessionStatus: "completed", completedAt, followUpDismissedAt: new Date() })
      .where(and(eq(workoutsTable.id, workoutId), eq(workoutsTable.sessionStatus, "scheduled"))).returning();
    if (!updated) {
      // A concurrent completion is idempotent; no other terminal transition is.
      const current = await authorizedWorkout(workoutId, scope.householdId);
      if (current?.sessionStatus === "completed") {
        res.json(await formatWorkout(current, true));
        return;
      }
      res.status(409).json({ error: "Workout session is no longer scheduled" });
      return;
    }
    res.json(await formatWorkout(updated, true));
  } catch (err) {
    req.log.error({ err }, "Failed to complete workout session");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/workout-sessions/:id/status", async (req, res) => {
  const workoutId = id(req.params.id);
  const parsed = UpdateWorkoutSessionStatusBody.safeParse(req.body);
  if (!workoutId || !parsed.success) return badRequest(res, "Invalid workout session status");
  try {
    const scope = getApprovedHouseholdScope(res);
    const existing = await authorizedWorkout(workoutId, scope.householdId);
    if (!existing) { res.status(404).json({ error: "Workout not found" }); return; }
    if (existing.sessionStatus !== "scheduled") return badRequest(res, "Only scheduled workouts can have their status updated");
    let today: string | null = null;
    if (parsed.data.status === "dismissed") {
      const [preferences] = await db.select().from(workoutPreferencesTable)
        .where(eq(workoutPreferencesTable.householdId, scope.householdId)).limit(1);
      today = householdDates(preferences?.timezone ?? "UTC").currentLocalDate;
      if (!existing.scheduledDate || existing.scheduledDate >= today) {
        return badRequest(res, "Only overdue scheduled workouts can have their follow-up dismissed");
      }
    }
    const condition = parsed.data.status === "dismissed"
      ? and(
          eq(workoutsTable.id, workoutId),
          eq(workoutsTable.sessionStatus, "scheduled"),
          lt(workoutsTable.scheduledDate, today!),
          isNull(workoutsTable.followUpDismissedAt),
        )
      : and(eq(workoutsTable.id, workoutId), eq(workoutsTable.sessionStatus, "scheduled"));
    const [updated] = await db.update(workoutsTable).set(parsed.data.status === "dismissed"
      ? { followUpDismissedAt: new Date() }
      : { sessionStatus: parsed.data.status, followUpDismissedAt: new Date() })
      .where(condition).returning();
    if (!updated) {
      res.status(409).json({ error: "Workout session is no longer eligible for that transition" });
      return;
    }
    res.json(await formatWorkout(updated, true));
  } catch (err) {
    req.log.error({ err }, "Failed to update workout session status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/workout-sessions/:id/reschedule", async (req, res) => {
  const workoutId = id(req.params.id);
  const parsed = RescheduleWorkoutSessionBody.safeParse(req.body);
  const scheduledDate = parsed.success ? dateOnly(parsed.data.scheduledDate) : null;
  if (!workoutId || !parsed.success || !scheduledDate) return badRequest(res, "Invalid workout reschedule");
  try {
    Intl.DateTimeFormat(undefined, { timeZone: parsed.data.scheduledTimezone });
    const scope = getApprovedHouseholdScope(res);
    const existing = await authorizedWorkout(workoutId, scope.householdId);
    if (!existing) { res.status(404).json({ error: "Workout not found" }); return; }
    if (existing.sessionStatus !== "scheduled") return badRequest(res, "Only scheduled workouts can be rescheduled");
    const updated = await db.transaction(async tx => {
      const participants = await tx.select({ memberId: workoutParticipantsTable.memberId })
        .from(workoutParticipantsTable).where(eq(workoutParticipantsTable.workoutId, workoutId)).for("update");
      for (const date of [...new Set([existing.workoutDate, scheduledDate])].sort()) {
        await lockWorkoutDate(tx, scope.householdId, date);
      }
      await assertNoWorkoutDuplicate(tx, scope.householdId, scheduledDate, existing.title,
        participants.map(participant => participant.memberId), workoutId);
      const [row] = await tx.update(workoutsTable).set({
        workoutDate: scheduledDate, scheduledDate, scheduledTime: parsed.data.scheduledTime ?? null,
        scheduledTimezone: parsed.data.scheduledTimezone, followUpDismissedAt: null,
      }).where(eq(workoutsTable.id, workoutId)).returning();
      return row;
    });
    res.json(await formatWorkout(updated, true));
  } catch (err) {
    if ((err as Error).message === "DUPLICATE") return res.status(409).json({ error: "An identical workout is already scheduled for these participants and date" });
    req.log.error({ err }, "Failed to reschedule workout session");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/workouts/:id/exercises", async (req, res) => {
  const workoutId = id(req.params.id);
  const parsed = AddExerciseBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid workout exercise", parsed.error.flatten());
  const name = parsed.data.name.trim();
  const groups = parsed.data.muscleGroups?.length ? parsed.data.muscleGroups : ["full_body"];
  if (!workoutId || !name || !groups.length || groups.some((group: unknown) => !muscleGroups.has(String(group)))) {
    return badRequest(res, "A valid name and muscleGroups are required");
  }
  try {
    const scope = getApprovedHouseholdScope(res);
    if (!(await authorizedWorkout(workoutId, scope.householdId))) {
      return res.status(404).json({ error: "Workout not found" });
    }
    const exercise = await db.transaction(async tx => {
      const library = await ensureLibraryExercise(tx, scope.householdId, name, groups);
      const [created] = await tx.insert(workoutExercisesTable).values({
        workoutId,
        libraryExerciseId: library.id,
        name: library.name,
        muscleGroups: library.muscleGroups,
        sets: parsed.data.sets ?? null,
        reps: parsed.data.reps ?? null,
        weightLbs: parsed.data.weightLbs ?? null,
        durationSeconds: parsed.data.durationSeconds ?? null,
        notes: parsed.data.notes ?? null,
      }).returning();
      return created;
    });
    res.status(201).json(formatExercise(exercise));
  } catch (err) {
    req.log.error({ err }, "Failed to add workout exercise");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/workout-exercises/:id", async (req, res) => {
  const exerciseId = id(req.params.id);
  if (!exerciseId) return badRequest(res, "Invalid exercise id");
  try {
    const scope = getApprovedHouseholdScope(res);
    const [row] = await db.select({ workoutId: workoutExercisesTable.workoutId })
      .from(workoutExercisesTable)
      .where(eq(workoutExercisesTable.id, exerciseId)).limit(1);
    if (!row || !(await authorizedWorkout(row.workoutId, scope.householdId))) {
      return res.status(404).json({ error: "Exercise not found" });
    }
    await db.delete(workoutExercisesTable).where(eq(workoutExercisesTable.id, exerciseId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete workout exercise");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatLibrary(item: typeof exerciseLibraryTable.$inferSelect) {
  return {
    id: String(item.id),
    name: item.name,
    normalizedName: item.normalizedName,
    muscleGroups: item.muscleGroups,
    createdAt: item.createdAt.toISOString(),
  };
}

router.get("/exercise-library", async (_req, res) => {
  const scope = getApprovedHouseholdScope(res);
  const rows = await db.select().from(exerciseLibraryTable)
    .where(eq(exerciseLibraryTable.householdId, scope.householdId))
    .orderBy(asc(exerciseLibraryTable.name));
  res.json(rows.map(formatLibrary));
});

router.get("/exercise-library/:id/history", async (req, res) => {
  const exerciseId = id(req.params.id);
  if (!exerciseId) return badRequest(res, "Invalid exercise id");
  try {
    const scope = getApprovedHouseholdScope(res);
    const [library] = await db.select({ id: exerciseLibraryTable.id }).from(exerciseLibraryTable)
      .where(and(eq(exerciseLibraryTable.id, exerciseId), eq(exerciseLibraryTable.householdId, scope.householdId))).limit(1);
    if (!library) { res.status(404).json({ error: "Exercise not found" }); return; }
    const rows = await db.select({ workout: workoutsTable, exercise: workoutExercisesTable })
      .from(workoutExercisesTable)
      .innerJoin(workoutsTable, eq(workoutExercisesTable.workoutId, workoutsTable.id))
      .innerJoin(workoutParticipantsTable, eq(workoutsTable.id, workoutParticipantsTable.workoutId))
      .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
      .where(and(eq(workoutExercisesTable.libraryExerciseId, exerciseId), eq(workoutsTable.sessionStatus, "completed"),
        eq(familyMembersTable.householdId, scope.householdId)))
      .orderBy(desc(workoutsTable.workoutDate));
    const unique = new Map<number, typeof rows[number]>();
    for (const row of rows) unique.set(row.workout.id, row);
    const participants = await participantsFor([...unique.keys()]);
    const appearances = [...unique.values()].map(row => ({
      workoutId: String(row.workout.id), workoutDate: row.workout.workoutDate, title: row.workout.title,
      participants: participants.get(row.workout.id) ?? [], exercise: formatExercise(row.exercise),
    }));
    res.json({ exerciseId: String(exerciseId), completedAppearanceCount: appearances.length, appearances });
  } catch (err) {
    req.log.error({ err }, "Failed to retrieve exercise history");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/exercise-library", async (req, res) => {
  const parsed = CreateLibraryExerciseBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid exercise", parsed.error.flatten());
  try {
    const scope = getApprovedHouseholdScope(res);
    const normalizedName = normalizeName(parsed.data.name);
    const [existing] = await db.select({ id: exerciseLibraryTable.id }).from(exerciseLibraryTable)
      .where(and(eq(exerciseLibraryTable.householdId, scope.householdId), eq(exerciseLibraryTable.normalizedName, normalizedName)))
      .limit(1);
    if (existing) return res.status(409).json({ error: "An exercise with this normalized name already exists" });
    const [created] = await db.insert(exerciseLibraryTable).values({
      householdId: scope.householdId,
      name: parsed.data.name.trim(),
      normalizedName,
      muscleGroups: parsed.data.muscleGroups,
    }).returning();
    res.status(201).json(formatLibrary(created));
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return res.status(409).json({ error: "Exercise already exists" });
    req.log.error({ err }, "Failed to create library exercise");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/exercise-library/:id", async (req, res) => {
  const exerciseId = id(req.params.id);
  const parsed = UpdateLibraryExerciseBody.safeParse(req.body);
  if (!exerciseId || !parsed.success) return badRequest(res, "Invalid exercise update");
  try {
    const scope = getApprovedHouseholdScope(res);
    const [updated] = await db.update(exerciseLibraryTable).set({
      name: parsed.data.name.trim(),
      normalizedName: normalizeName(parsed.data.name),
      muscleGroups: parsed.data.muscleGroups,
      updatedAt: new Date(),
    }).where(and(eq(exerciseLibraryTable.id, exerciseId), eq(exerciseLibraryTable.householdId, scope.householdId))).returning();
    if (!updated) return res.status(404).json({ error: "Exercise not found" });
    await db.update(workoutExercisesTable).set({
      name: updated.name,
      muscleGroups: updated.muscleGroups,
    }).where(eq(workoutExercisesTable.libraryExerciseId, updated.id));
    res.json(formatLibrary(updated));
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return res.status(409).json({ error: "Exercise already exists" });
    req.log.error({ err }, "Failed to update library exercise");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/exercise-library/:id", async (req, res) => {
  const exerciseId = id(req.params.id);
  if (!exerciseId) return badRequest(res, "Invalid exercise id");
  try {
    const scope = getApprovedHouseholdScope(res);
    const [item] = await db.select().from(exerciseLibraryTable).where(and(
      eq(exerciseLibraryTable.id, exerciseId),
      eq(exerciseLibraryTable.householdId, scope.householdId),
    )).limit(1);
    if (!item) return res.status(404).json({ error: "Exercise not found" });
    const [reference] = await db.select({ id: workoutExercisesTable.id }).from(workoutExercisesTable)
      .where(eq(workoutExercisesTable.libraryExerciseId, exerciseId)).limit(1);
    if (reference) return res.status(409).json({ error: "Exercise is used by workout history and cannot be deleted" });
    await db.delete(exerciseLibraryTable).where(eq(exerciseLibraryTable.id, exerciseId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete library exercise");
    res.status(500).json({ error: "Internal server error" });
  }
});

const draftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "title", "durationMinutes", "notes", "rationale", "exercises"],
  properties: {
    intent: { type: "string", enum: ["plan", "log_completed"] },
    title: { type: "string", minLength: 1, maxLength: 160 },
    durationMinutes: { type: "integer", minimum: 1, maximum: 1440 },
    notes: { type: ["string", "null"], maxLength: 4000 },
    rationale: { type: "string", minLength: 1, maxLength: 2000 },
    exercises: {
      type: "array", minItems: 1, maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "muscleGroups", "sets", "reps", "weightLbs", "durationSeconds", "notes"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          muscleGroups: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", enum: MUSCLE_GROUPS } },
          sets: { type: ["integer", "null"], minimum: 1, maximum: 100 },
          reps: { type: ["integer", "null"], minimum: 1, maximum: 1000 },
          weightLbs: { type: ["integer", "null"], minimum: 0, maximum: 5000 },
          durationSeconds: { type: ["integer", "null"], minimum: 1, maximum: 86400 },
          notes: { type: ["string", "null"], maxLength: 500 },
        },
      },
    },
  },
} as const;

async function aiJson(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, schema: any, name: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 8192,
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    messages,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned no structured content");
  return JSON.parse(content);
}

async function householdContext(householdId: number) {
  const [history, library, preferences] = await Promise.all([
    db.select({ title: workoutsTable.title, workoutDate: workoutsTable.workoutDate })
      .from(workoutsTable)
      .innerJoin(workoutParticipantsTable, eq(workoutsTable.id, workoutParticipantsTable.workoutId))
      .innerJoin(familyMembersTable, eq(workoutParticipantsTable.memberId, familyMembersTable.id))
      .where(eq(familyMembersTable.householdId, householdId))
      .orderBy(desc(workoutsTable.workoutDate)).limit(20),
    db.select({ name: exerciseLibraryTable.name, muscleGroups: exerciseLibraryTable.muscleGroups })
      .from(exerciseLibraryTable).where(eq(exerciseLibraryTable.householdId, householdId)).limit(100),
    db.select().from(workoutPreferencesTable).where(eq(workoutPreferencesTable.householdId, householdId)).limit(1),
  ]);
  // Keep prompts bounded even if historical free text or exercise names grow.
  return {
    history: history.map(row => ({ title: row.title.slice(0, 160), workoutDate: row.workoutDate })).slice(0, 20),
    library: library.map(row => ({ name: row.name.slice(0, 120), muscleGroups: row.muscleGroups.slice(0, 12) })).slice(0, 100),
    preferences: preferences[0] ? {
      ...preferences[0],
      goals: preferences[0].goals.slice(0, 2000),
      equipment: preferences[0].equipment.slice(0, 2000),
      limitations: preferences[0].limitations.slice(0, 2000),
      notes: preferences[0].notes.slice(0, 2000),
    } : null,
  };
}

router.post("/ai/workout-draft", async (req, res) => {
  const parsed = DraftWorkoutBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid workout draft request", parsed.error.flatten());
  try {
    const scope = getApprovedHouseholdScope(res);
    const members = await validateAdultIds(db, parsed.data.participantIds, scope.householdId);
    if (!members) return badRequest(res, "Every participant must be an active adult in this household");
    const context = await householdContext(scope.householdId);
    const raw = await aiJson([
      { role: "system", content: "You are a careful family fitness coach. Produce an editable workout draft only. Set intent to plan unless the user clearly says the workout already happened and wants to record it; only then use log_completed. Account for stated limitations; never claim medical certainty." },
      { role: "user", content: JSON.stringify({ request: parsed.data.prompt, requestedPreferences: parsed.data.preferences, participants: members.map(m => m.name), context }) },
    ], draftJsonSchema, "workout_draft");
    const draft = DraftWorkoutResponse.safeParse(raw);
    if (!draft.success) {
      req.log.warn({ issues: draft.error.issues }, "OpenAI returned invalid workout draft");
      return res.status(502).json({ error: "AI returned a malformed workout draft", details: draft.error.flatten() });
    }
    res.json(draft.data);
  } catch (err) {
    req.log.error({ err }, "Failed to draft workout");
    res.status(502).json({ error: "Unable to generate a valid workout draft" });
  }
});

router.post("/ai/recommend-workout", async (req, res) => {
  const participantId = id(req.body?.memberId);
  if (!participantId) return badRequest(res, "Invalid memberId");
  try {
    const scope = getApprovedHouseholdScope(res);
    const members = await validateAdultIds(db, [participantId], scope.householdId);
    if (!members) return res.status(404).json({ error: "Adult participant not found" });
    const context = await householdContext(scope.householdId);
    const raw = await aiJson([
      { role: "system", content: "Recommend a balanced editable workout based on household workout history. This is a proposed workout, so set intent to plan." },
      { role: "user", content: JSON.stringify({ participant: members[0].name, context }) },
    ], draftJsonSchema, "workout_recommendation");
    const draft = DraftWorkoutResponse.safeParse(raw);
    if (!draft.success) return res.status(502).json({ error: "AI returned a malformed workout recommendation" });
    res.json({ title: draft.data.title, rationale: draft.data.rationale, exercises: draft.data.exercises });
  } catch (err) {
    req.log.error({ err }, "Failed to recommend workout");
    res.status(502).json({ error: "Unable to generate a workout recommendation" });
  }
});

function defaultPreferences() {
  return {
    daysOfWeek: [] as number[],
    goals: "",
    sessionDurationMinutes: 30,
    equipment: "",
    limitations: "",
    notes: "",
    timezone: "UTC",
  };
}

function householdDates(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  const currentLocalDate = `${value("year")}-${value("month")}-${value("day")}`;
  const weekday = value("weekday");
  const offset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday ?? "");
  const date = new Date(`${currentLocalDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (offset < 0 ? 0 : offset));
  return { currentLocalDate, currentWeekStart: date.toISOString().slice(0, 10) };
}

router.get("/workout-preferences", async (_req, res) => {
  const scope = getApprovedHouseholdScope(res);
  const [preferences] = await db.select().from(workoutPreferencesTable)
    .where(eq(workoutPreferencesTable.householdId, scope.householdId)).limit(1);
  const value = preferences ?? { ...defaultPreferences(), updatedAt: new Date(0) };
  res.json({ ...value, updatedAt: value.updatedAt.toISOString(), ...householdDates(value.timezone) });
});

router.put("/workout-preferences", async (req, res) => {
  const parsed = UpdateWorkoutPreferencesBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid workout preferences", parsed.error.flatten());
  try {
    Intl.DateTimeFormat(undefined, { timeZone: parsed.data.timezone });
  } catch {
    return badRequest(res, "timezone must be a valid IANA timezone");
  }
  const scope = getApprovedHouseholdScope(res);
  const [saved] = await db.insert(workoutPreferencesTable).values({
    householdId: scope.householdId,
    ...parsed.data,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: workoutPreferencesTable.householdId,
    set: { ...parsed.data, updatedAt: new Date() },
  }).returning();
  res.json({ ...saved, updatedAt: saved.updatedAt.toISOString(), ...householdDates(saved.timezone) });
});

router.post("/ai/workout-week-plan", async (req, res) => {
  const parsed = GenerateWorkoutWeekPlanBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid week plan request", parsed.error.flatten());
  const weekStart = dateOnly(parsed.data.weekStart);
  if (!weekStart) return badRequest(res, "weekStart must be a date-only value");
  try {
    const scope = getApprovedHouseholdScope(res);
    const members = await validateAdultIds(db, parsed.data.participantIds, scope.householdId);
    if (!members) return badRequest(res, "Every participant must be an active adult in this household");
    const context = await householdContext(scope.householdId);
    const preferences = parsed.data.preferences ?? context.preferences ?? defaultPreferences();
    let dates: { currentWeekStart: string; currentLocalDate: string };
    try {
      dates = householdDates(preferences.timezone);
    } catch {
      return badRequest(res, "preferences.timezone must be a valid IANA timezone");
    }
    const requestTimestamp = Date.parse(`${weekStart}T00:00:00Z`);
    const currentTimestamp = Date.parse(`${dates.currentWeekStart}T00:00:00Z`);
    if (requestTimestamp % (7 * 86400000) !== (Date.parse("1970-01-05T00:00:00Z") % (7 * 86400000))) {
      return badRequest(res, "weekStart must be a Monday in the household timezone");
    }
    if (requestTimestamp < currentTimestamp - 7 * 86400000 || requestTimestamp > currentTimestamp + 26 * 7 * 86400000) {
      return badRequest(res, "weekStart must be between last week and 26 weeks ahead");
    }
    const weekSchema = {
      type: "object", additionalProperties: false, required: ["weekStart", "timezone", "items"],
      properties: {
        weekStart: { type: "string" }, timezone: { type: "string" },
        items: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["workoutDate", "participantIds", "workout"],
          properties: {
            workoutDate: { type: "string" },
            participantIds: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              uniqueItems: true,
              items: { type: "string", enum: parsed.data.participantIds },
            },
            workout: draftJsonSchema,
          },
        } },
      },
    };
    const raw = await aiJson([
      { role: "system", content: "Create a balanced seven-day-or-shorter plan. Use only dates in the requested seven-day window and only supplied participant IDs." },
      { role: "user", content: JSON.stringify({ weekStart, participants: members.map(m => ({ id: String(m.id), name: m.name })), preferences, context }) },
    ], weekSchema, "workout_week_plan");
    const result = GenerateWorkoutWeekPlanResponse.safeParse(raw);
    if (!result.success) return res.status(502).json({ error: "AI returned a malformed week plan", details: result.error.flatten() });
    for (const item of result.data.items) {
      if (new Set(item.participantIds).size !== item.participantIds.length) {
        return res.status(502).json({ error: "AI returned duplicate workout participants" });
      }
      const itemMembers = await validateAdultIds(db, item.participantIds, scope.householdId);
      if (!itemMembers) {
        return res.status(502).json({ error: "AI returned an unauthorized or invalid workout participant" });
      }
    }
    const start = Date.parse(`${weekStart}T00:00:00Z`);
    const badDate = result.data.items.some(item => {
      const timestamp = Date.parse(`${dateOnly(item.workoutDate)}T00:00:00Z`);
      return !Number.isFinite(timestamp) || timestamp < start || timestamp >= start + 7 * 86400000;
    });
    if (badDate) return res.status(502).json({ error: "AI returned dates outside the requested week" });
    res.json({
      ...result.data,
      weekStart,
      timezone: preferences.timezone,
      items: result.data.items.map(item => ({ ...item, workoutDate: dateOnly(item.workoutDate) })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate workout week plan");
    res.status(502).json({ error: "Unable to generate a valid week plan" });
  }
});

router.post("/workout-week-plan/save", async (req, res) => {
  const rawWeekStart = exactDateOnlyString((req.body as { weekStart?: unknown } | null)?.weekStart);
  if (!rawWeekStart) return badRequest(res, "weekStart must be an exact real yyyy-MM-dd date");
  const parsed = SaveWorkoutWeekPlanBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid reviewed week plan", parsed.error.flatten());
  const weekStart = rawWeekStart;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: parsed.data.timezone });
  } catch {
    return badRequest(res, "timezone must be a valid IANA timezone");
  }
  const weekStartTimestamp = Date.parse(`${weekStart}T00:00:00Z`);
  if (new Date(weekStartTimestamp).getUTCDay() !== 1) return badRequest(res, "weekStart must be a Monday");
  const hasDateOutsideWeek = parsed.data.items.some(item => {
    const itemDate = dateOnly(item.workoutDate);
    const timestamp = itemDate ? Date.parse(`${itemDate}T00:00:00Z`) : Number.NaN;
    return !Number.isFinite(timestamp) || timestamp < weekStartTimestamp || timestamp >= weekStartTimestamp + 7 * 86400000;
  });
  if (hasDateOutsideWeek) return badRequest(res, "All workout dates must belong to the requested week");
  if (parsed.data.items.some(item => new Set(item.participantIds).size !== item.participantIds.length)) {
    return badRequest(res, "Each planned workout must have unique participantIds");
  }
  try {
    const scope = getApprovedHouseholdScope(res);
    const allParticipantIds = [...new Set(parsed.data.items.flatMap(item => item.participantIds))];
    const members = await validateAdultIds(db, allParticipantIds, scope.householdId);
    if (!members) return badRequest(res, "Every participant must be an active adult in this household");
    const created = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`workout-plan:${scope.householdId}`}))`);
      const results: Array<typeof workoutsTable.$inferSelect> = [];
      for (const item of parsed.data.items) {
        const workoutDate = dateOnly(item.workoutDate);
        if (!workoutDate) throw new Error("INVALID_DATE");
        const participantNumbers = item.participantIds.map(value => id(value)!);
        await lockWorkoutDate(tx, scope.householdId, workoutDate);
        await assertNoWorkoutDuplicate(tx, scope.householdId, workoutDate, item.workout.title, participantNumbers);
        const [workout] = await tx.insert(workoutsTable).values({
          memberId: participantNumbers[0],
          title: item.workout.title.trim(),
          workoutDate,
          durationMinutes: item.workout.durationMinutes,
          notes: item.workout.notes ?? item.workout.rationale,
          sessionKind: "weekly_plan",
          sessionStatus: "scheduled",
          scheduledDate: workoutDate,
          scheduledTimezone: parsed.data.timezone,
        }).returning();
        await tx.insert(workoutParticipantsTable).values(participantNumbers.map(memberId => ({ workoutId: workout.id, memberId })));
        await insertExercises(tx, workout.id, scope.householdId, item.workout.exercises);
        results.push(workout);
      }
      return results;
    });
    res.status(201).json(await Promise.all(created.map(workout => formatWorkout(workout, true))));
  } catch (err) {
    if ((err as Error).message === "DUPLICATE") return res.status(409).json({ error: "A workout with the same date and title already exists" });
    if ((err as Error).message === "INVALID_DATE") return badRequest(res, "All workout dates must be date-only values");
    req.log.error({ err }, "Failed to save workout week plan");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatCoachMessage(message: typeof workoutCoachMessagesTable.$inferSelect) {
  let draft: unknown = null;
  if (message.draftJson !== null) {
    try {
      const parsed = DraftWorkoutResponse.safeParse(JSON.parse(message.draftJson));
      if (!parsed.success) throw new Error("Stored coach draft violates contract");
      draft = parsed.data;
    } catch (err) {
      throw new Error(`Stored coach draft is malformed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  return { id: String(message.id), role: message.role, content: message.content, draft, createdAt: message.createdAt.toISOString() };
}

router.get("/workout-coach/conversations", async (_req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const rows = await db.select().from(workoutCoachMessagesTable)
      .where(eq(workoutCoachMessagesTable.householdId, scope.householdId))
      .orderBy(asc(workoutCoachMessagesTable.createdAt)).limit(100);
    res.json({ messages: rows.map(formatCoachMessage) });
  } catch (err) {
    _req.log.error({ err }, "Failed to retrieve workout coach conversation");
    res.status(500).json({ error: "Stored workout coach history could not be validated" });
  }
});

router.post("/workout-coach/conversations", async (req, res) => {
  const parsed = SendWorkoutCoachMessageBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid coach message", parsed.error.flatten());
  try {
    const scope = getApprovedHouseholdScope(res);
    if (parsed.data.participantIds?.length && !(await validateAdultIds(db, parsed.data.participantIds, scope.householdId))) {
      return badRequest(res, "Every participant must be an active adult in this household");
    }
    const [prior, context] = await Promise.all([
      db.select().from(workoutCoachMessagesTable).where(eq(workoutCoachMessagesTable.householdId, scope.householdId))
        .orderBy(desc(workoutCoachMessagesTable.createdAt)).limit(20),
      householdContext(scope.householdId),
    ]);
    const replySchema = {
      type: "object", additionalProperties: false, required: ["message", "draft"],
      properties: { message: { type: "string" }, draft: { anyOf: [draftJsonSchema, { type: "null" }] } },
    };
    const raw = await aiJson([
      { role: "system", content: `You are a family workout coach. First identify the user's goal. When creating, recommending, adjusting, or discussing a workout they could do, return an editable draft with intent plan. Use intent log_completed only when the user clearly states they already performed the workout and wants it recorded. If the goal is ambiguous, prefer plan and explain the proposed workout. Never claim to save or mutate workouts; the user must confirm the draft action. Context: ${JSON.stringify(context)}` },
      ...prior.reverse().map(message => ({ role: message.role as "user" | "assistant", content: message.content })),
      { role: "user", content: parsed.data.content },
    ], replySchema, "workout_coach_reply");
    if (typeof raw?.message !== "string" || (raw.draft !== null && !DraftWorkoutResponse.safeParse(raw.draft).success)) {
      return res.status(502).json({ error: "AI returned a malformed coaching response" });
    }
    const [userMessage, assistantMessage] = await db.transaction(async tx => {
      const [user] = await tx.insert(workoutCoachMessagesTable).values({
        householdId: scope.householdId, role: "user", content: parsed.data.content,
      }).returning();
      const [assistant] = await tx.insert(workoutCoachMessagesTable).values({
        householdId: scope.householdId, role: "assistant", content: raw.message,
        draftJson: raw.draft ? JSON.stringify(raw.draft) : null,
      }).returning();
      return [user, assistant];
    });
    res.status(201).json({
      userMessage: formatCoachMessage(userMessage),
      assistantMessage: formatCoachMessage(assistantMessage),
      draft: raw.draft,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send workout coach message");
    res.status(502).json({ error: "Unable to generate a valid coaching response" });
  }
});

export default router;