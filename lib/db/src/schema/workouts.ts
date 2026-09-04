import {
  pgTable,
  serial,
  text,
  integer,
  date,
  timestamp,
  unique,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { familyMembersTable } from "./familyMembers";
import { householdsTable } from "./households";

export const MUSCLE_GROUPS = [
  "full_body", "chest", "back", "shoulders", "arms", "core",
  "glutes", "quadriceps", "hamstrings", "calves", "cardio", "mobility",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const workoutsTable = pgTable("workouts", {
  id: serial("id").primaryKey(),
  // Retained during the join-table migration for backwards compatibility.
  // New writes set this to the first participant; workoutParticipants is canonical.
  memberId: integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  workoutDate: date("workout_date", { mode: "string" }).notNull(),
  // workoutDate remains the compatibility/display date. Scheduled sessions use
  // scheduledDate as their calendar anchor until they are completed.
  scheduledDate: date("scheduled_date", { mode: "string" }),
  scheduledTime: text("scheduled_time"),
  scheduledTimezone: text("scheduled_timezone"),
  sessionStatus: text("session_status").notNull().default("completed"),
  sessionKind: text("session_kind").notNull().default("ad_hoc"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  followUpDismissedAt: timestamp("follow_up_dismissed_at", { withTimezone: true }),
  rescheduledFromWorkoutId: integer("rescheduled_from_workout_id"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workoutParticipantsTable = pgTable("workout_participants", {
  workoutId: integer("workout_id").notNull().references(() => workoutsTable.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("workout_participants_workout_member_unique").on(table.workoutId, table.memberId),
  index("workout_participants_member_idx").on(table.memberId),
]);

export const exerciseLibraryTable = pgTable("exercise_library", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  muscleGroups: text("muscle_groups").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("exercise_library_household_normalized_unique").on(table.householdId, table.normalizedName),
]);

export const workoutExercisesTable = pgTable("workout_exercises", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id").notNull().references(() => workoutsTable.id, { onDelete: "cascade" }),
  libraryExerciseId: integer("library_exercise_id").references(() => exerciseLibraryTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  muscleGroups: text("muscle_groups").array().notNull().default([]),
  sets: integer("sets"),
  reps: integer("reps"),
  weightLbs: integer("weight_lbs"),
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
});

export const workoutPreferencesTable = pgTable("workout_preferences", {
  householdId: integer("household_id").primaryKey().references(() => householdsTable.id, { onDelete: "cascade" }),
  daysOfWeek: integer("days_of_week").array().notNull().default([]),
  goals: text("goals").notNull().default(""),
  sessionDurationMinutes: integer("session_duration_minutes").notNull().default(30),
  equipment: text("equipment").notNull().default(""),
  limitations: text("limitations").notNull().default(""),
  notes: text("notes").notNull().default(""),
  timezone: text("timezone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workoutCoachMessagesTable = pgTable("workout_coach_messages", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  draftJson: text("draft_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("workout_coach_messages_household_created_idx").on(table.householdId, table.createdAt),
]);

export type Workout = typeof workoutsTable.$inferSelect;
export type WorkoutExercise = typeof workoutExercisesTable.$inferSelect;
export type ExerciseLibraryItem = typeof exerciseLibraryTable.$inferSelect;