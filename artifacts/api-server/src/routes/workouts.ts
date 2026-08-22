import { Router } from "express";
import { db } from "@workspace/db";
import { workoutsTable, workoutExercisesTable, familyMembersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();

// Resolves a workout within the scope's household in SQL. Returns null for both
// missing and cross-household workouts so IDs never reveal existence.
async function resolveAuthorizedWorkout(
  workoutId: number,
  householdId: number,
): Promise<{ workout: typeof workoutsTable.$inferSelect; memberName: string } | null> {
  const [row] = await db
    .select({ workout: workoutsTable, memberName: familyMembersTable.name })
    .from(workoutsTable)
    .innerJoin(familyMembersTable, eq(workoutsTable.memberId, familyMembersTable.id))
    .where(and(eq(workoutsTable.id, workoutId), eq(familyMembersTable.householdId, householdId)))
    .limit(1);
  if (!row) return null;
  return { workout: row.workout, memberName: row.memberName };
}

// Requires a family member to belong to the scope's household.
async function resolveHouseholdMember(memberId: number, householdId: number) {
  const [member] = await db
    .select()
    .from(familyMembersTable)
    .where(and(eq(familyMembersTable.id, memberId), eq(familyMembersTable.householdId, householdId)))
    .limit(1);
  return member ?? null;
}

// GET /workouts
router.get("/workouts", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const { memberId } = req.query;

    let requestedMemberId: number | undefined;
    if (memberId !== undefined) {
      requestedMemberId = Number(memberId);
      if (isNaN(requestedMemberId)) {
        res.status(400).json({ error: "Invalid memberId" });
        return;
      }
      const member = await resolveHouseholdMember(requestedMemberId, scope.householdId);
      if (!member) {
        res.status(403).json({ error: "Member not authorized" });
        return;
      }
    }

    const rows = await db
      .select({
        workout: workoutsTable,
        memberName: familyMembersTable.name,
      })
      .from(workoutsTable)
      .innerJoin(familyMembersTable, eq(workoutsTable.memberId, familyMembersTable.id))
      .where(eq(familyMembersTable.householdId, scope.householdId))
      .orderBy(desc(workoutsTable.workoutDate), desc(workoutsTable.createdAt));

    let filtered = rows;
    if (requestedMemberId !== undefined) {
      filtered = filtered.filter((r) => r.workout.memberId === requestedMemberId);
    }

    // Get exercise counts
    const exerciseCounts: Record<number, number> = {};
    for (const row of filtered) {
      const exs = await db
        .select()
        .from(workoutExercisesTable)
        .where(eq(workoutExercisesTable.workoutId, row.workout.id));
      exerciseCounts[row.workout.id] = exs.length;
    }

    res.json(
      filtered.map((r) => ({
        id: String(r.workout.id),
        memberId: String(r.workout.memberId),
        memberName: r.memberName ?? "",
        workoutDate: r.workout.workoutDate,
        title: r.workout.title,
        durationMinutes: r.workout.durationMinutes ?? null,
        notes: r.workout.notes ?? null,
        exerciseCount: exerciseCounts[r.workout.id] ?? 0,
        createdAt: r.workout.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get workouts");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /workouts
router.post("/workouts", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const { memberId, title, workoutDate, durationMinutes, notes } = req.body;
    if (!memberId || !title || !workoutDate) {
      res.status(400).json({ error: "memberId, title, workoutDate required" });
      return;
    }
    const memberIdNum = Number(memberId);
    if (isNaN(memberIdNum)) {
      res.status(400).json({ error: "Invalid memberId" });
      return;
    }

    const member = await resolveHouseholdMember(memberIdNum, scope.householdId);
    if (!member) {
      res.status(403).json({ error: "Member not authorized" });
      return;
    }

    const [workout] = await db
      .insert(workoutsTable)
      .values({
        memberId: memberIdNum,
        title,
        workoutDate,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        notes: notes ?? null,
      })
      .returning();

    res.status(201).json({
      id: String(workout.id),
      memberId: String(workout.memberId),
      memberName: member.name ?? "",
      workoutDate: workout.workoutDate,
      title: workout.title,
      durationMinutes: workout.durationMinutes ?? null,
      notes: workout.notes ?? null,
      exerciseCount: 0,
      createdAt: workout.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /workouts/:id
router.get("/workouts/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const resolved = await resolveAuthorizedWorkout(id, scope.householdId);
    if (!resolved) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const exercises = await db
      .select()
      .from(workoutExercisesTable)
      .where(eq(workoutExercisesTable.workoutId, id));

    res.json({
      id: String(resolved.workout.id),
      memberId: String(resolved.workout.memberId),
      memberName: resolved.memberName,
      workoutDate: resolved.workout.workoutDate,
      title: resolved.workout.title,
      durationMinutes: resolved.workout.durationMinutes ?? null,
      notes: resolved.workout.notes ?? null,
      createdAt: resolved.workout.createdAt.toISOString(),
      exercises: exercises.map((e) => ({
        id: String(e.id),
        workoutId: String(e.workoutId),
        name: e.name,
        sets: e.sets ?? null,
        reps: e.reps ?? null,
        weightLbs: e.weightLbs ?? null,
        durationSeconds: e.durationSeconds ?? null,
        notes: e.notes ?? null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /workouts/:id
router.delete("/workouts/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const resolved = await resolveAuthorizedWorkout(id, scope.householdId);
    if (!resolved) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(workoutsTable).where(eq(workoutsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /workouts/:id/exercises
router.post("/workouts/:id/exercises", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const workoutId = Number(req.params.id);
    if (isNaN(workoutId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { name, sets, reps, weightLbs, durationSeconds, notes } = req.body;
    if (!name) {
      res.status(400).json({ error: "name required" });
      return;
    }

    const resolved = await resolveAuthorizedWorkout(workoutId, scope.householdId);
    if (!resolved) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [exercise] = await db
      .insert(workoutExercisesTable)
      .values({
        workoutId,
        name,
        sets: sets ? Number(sets) : null,
        reps: reps ? Number(reps) : null,
        weightLbs: weightLbs ? Number(weightLbs) : null,
        durationSeconds: durationSeconds ? Number(durationSeconds) : null,
        notes: notes ?? null,
      })
      .returning();

    res.status(201).json({
      id: String(exercise.id),
      workoutId: String(exercise.workoutId),
      name: exercise.name,
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      weightLbs: exercise.weightLbs ?? null,
      durationSeconds: exercise.durationSeconds ?? null,
      notes: exercise.notes ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to add exercise");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /workout-exercises/:id
router.delete("/workout-exercises/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select({ id: workoutExercisesTable.id })
      .from(workoutExercisesTable)
      .innerJoin(workoutsTable, eq(workoutExercisesTable.workoutId, workoutsTable.id))
      .innerJoin(familyMembersTable, eq(workoutsTable.memberId, familyMembersTable.id))
      .where(and(eq(workoutExercisesTable.id, id), eq(familyMembersTable.householdId, scope.householdId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db
      .delete(workoutExercisesTable)
      .where(eq(workoutExercisesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete exercise");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /ai/recommend-workout
router.post("/ai/recommend-workout", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const { memberId } = req.body;
    if (!memberId) {
      res.status(400).json({ error: "memberId and memberName required" });
      return;
    }
    const memberIdNum = Number(memberId);
    if (isNaN(memberIdNum)) {
      res.status(400).json({ error: "Invalid memberId" });
      return;
    }

    const member = await resolveHouseholdMember(memberIdNum, scope.householdId);
    if (!member) {
      res.status(403).json({ error: "Member not authorized" });
      return;
    }
    const memberName = member.name;

    // Pull last 10 workouts for this member
    const recentWorkouts = await db
      .select({ workout: workoutsTable })
      .from(workoutsTable)
      .where(eq(workoutsTable.memberId, memberIdNum))
      .orderBy(desc(workoutsTable.workoutDate))
      .limit(10);

    // Get exercises for each recent workout
    const workoutHistory: string[] = [];
    for (const { workout } of recentWorkouts) {
      const exercises = await db
        .select()
        .from(workoutExercisesTable)
        .where(eq(workoutExercisesTable.workoutId, workout.id));

      const exList = exercises
        .map((e) => {
          const parts = [e.name];
          if (e.sets && e.reps) parts.push(`${e.sets}x${e.reps}`);
          if (e.weightLbs) parts.push(`@ ${e.weightLbs}lbs`);
          if (e.durationSeconds) parts.push(`${e.durationSeconds}s`);
          return parts.join(" ");
        })
        .join(", ");

      workoutHistory.push(
        `${workout.workoutDate} — ${workout.title}${exList ? `: ${exList}` : ""}`,
      );
    }

    const historyText =
      workoutHistory.length > 0
        ? workoutHistory.join("\n")
        : "No workout history yet — this is their first workout.";

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a personal fitness coach. Based on ${memberName}'s recent workout history, recommend a well-balanced workout for today.

Recent workout history:
${historyText}

Consider muscle group balance, rest days, and progression. If there's no history, suggest a good beginner full-body routine.

Respond ONLY with valid JSON in this exact format:
{
  "title": "Workout name (e.g. 'Upper Body Push', 'Full Body Circuit', 'Active Recovery Run')",
  "rationale": "1-2 sentences explaining why this workout makes sense today given their history",
  "exercises": [
    {
      "name": "Exercise name",
      "sets": 3,
      "reps": 10,
      "durationSeconds": null,
      "weightLbs": null,
      "notes": "Form tip or modification"
    }
  ]
}

Include 4-6 exercises. Use null for fields that don't apply (e.g. cardio has durationSeconds but not sets/reps).`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }

    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to recommend workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
