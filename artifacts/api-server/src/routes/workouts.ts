import { Router } from "express";
import { db } from "@workspace/db";
import { workoutsTable, workoutExercisesTable, familyMembersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// GET /workouts
router.get("/workouts", async (req, res) => {
  try {
    const { memberId } = req.query;

    const rows = await db
      .select({
        workout: workoutsTable,
        memberName: familyMembersTable.name,
      })
      .from(workoutsTable)
      .leftJoin(familyMembersTable, eq(workoutsTable.memberId, familyMembersTable.id))
      .orderBy(desc(workoutsTable.workoutDate), desc(workoutsTable.createdAt));

    let filtered = rows;
    if (memberId) {
      filtered = filtered.filter((r) => String(r.workout.memberId) === String(memberId));
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
    const { memberId, title, workoutDate, durationMinutes, notes } = req.body;
    if (!memberId || !title || !workoutDate) {
      return res.status(400).json({ error: "memberId, title, workoutDate required" });
    }

    const [workout] = await db
      .insert(workoutsTable)
      .values({
        memberId: Number(memberId),
        title,
        workoutDate,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        notes: notes ?? null,
      })
      .returning();

    const [member] = await db
      .select()
      .from(familyMembersTable)
      .where(eq(familyMembersTable.id, workout.memberId));

    res.status(201).json({
      id: String(workout.id),
      memberId: String(workout.memberId),
      memberName: member?.name ?? "",
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
    const id = Number(req.params.id);

    const [row] = await db
      .select({ workout: workoutsTable, memberName: familyMembersTable.name })
      .from(workoutsTable)
      .leftJoin(familyMembersTable, eq(workoutsTable.memberId, familyMembersTable.id))
      .where(eq(workoutsTable.id, id));

    if (!row) return res.status(404).json({ error: "Not found" });

    const exercises = await db
      .select()
      .from(workoutExercisesTable)
      .where(eq(workoutExercisesTable.workoutId, id));

    res.json({
      id: String(row.workout.id),
      memberId: String(row.workout.memberId),
      memberName: row.memberName ?? "",
      workoutDate: row.workout.workoutDate,
      title: row.workout.title,
      durationMinutes: row.workout.durationMinutes ?? null,
      notes: row.workout.notes ?? null,
      createdAt: row.workout.createdAt.toISOString(),
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
    await db.delete(workoutsTable).where(eq(workoutsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /workouts/:id/exercises
router.post("/workouts/:id/exercises", async (req, res) => {
  try {
    const workoutId = Number(req.params.id);
    const { name, sets, reps, weightLbs, durationSeconds, notes } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

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
    await db
      .delete(workoutExercisesTable)
      .where(eq(workoutExercisesTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete exercise");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /ai/recommend-workout
router.post("/ai/recommend-workout", async (req, res) => {
  try {
    const { memberId, memberName } = req.body;
    if (!memberId || !memberName) {
      return res.status(400).json({ error: "memberId and memberName required" });
    }

    // Pull last 10 workouts for this member
    const recentWorkouts = await db
      .select({ workout: workoutsTable })
      .from(workoutsTable)
      .where(eq(workoutsTable.memberId, Number(memberId)))
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
      return res.status(500).json({ error: "Failed to parse AI response" });
    }

    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to recommend workout");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
