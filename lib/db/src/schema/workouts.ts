import { pgTable, serial, text, integer, date, timestamp } from "drizzle-orm/pg-core";
import { familyMembersTable } from "./familyMembers";

export const workoutsTable = pgTable("workouts", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  workoutDate: date("workout_date", { mode: "string" }).notNull(),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workoutExercisesTable = pgTable("workout_exercises", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id").notNull().references(() => workoutsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sets: integer("sets"),
  reps: integer("reps"),
  weightLbs: integer("weight_lbs"),
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
});

export type Workout = typeof workoutsTable.$inferSelect;
export type WorkoutExercise = typeof workoutExercisesTable.$inferSelect;
