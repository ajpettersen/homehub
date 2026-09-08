import { WorkoutDraft } from "@workspace/api-client-react";

export interface StarterRoutine extends WorkoutDraft {
  id: string;
  summary: string;
}

export const STARTER_ROUTINES: StarterRoutine[] = [
  {
    id: "upper-body-strength",
    intent: "plan",
    title: "Upper Body Strength",
    durationMinutes: 45,
    summary: "Focus on pushing and pulling movements.",
    notes: "Rest 60-90 seconds between sets. Focus on form over heavy weights.",
    rationale: "Build strength and muscle in the chest, back, shoulders, and arms.",
    exercises: [
      { name: "Dumbbell Bench Press", muscleGroups: ["chest", "shoulders", "arms"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Control the descent" },
      { name: "Bent Over Dumbbell Row", muscleGroups: ["back", "arms", "core"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Pull to your hip" },
      { name: "Seated Overhead Press", muscleGroups: ["shoulders", "arms"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Keep core tight" },
      { name: "Lat Pulldown", muscleGroups: ["back", "arms"], sets: 3, reps: 12, weightLbs: null, durationSeconds: null, notes: "Squeeze shoulder blades" },
      { name: "Bicep Curls", muscleGroups: ["arms"], sets: 3, reps: 12, weightLbs: null, durationSeconds: null, notes: "Don't swing the weight" }
    ]
  },
  {
    id: "lower-body-power",
    intent: "plan",
    title: "Lower Body Power",
    durationMinutes: 45,
    summary: "Develop leg strength, power, and stability.",
    notes: "Warm up properly before starting. Rest 90 seconds between compound movements.",
    rationale: "Build strong quads, hamstrings, and glutes.",
    exercises: [
      { name: "Goblet Squat", muscleGroups: ["quadriceps", "glutes", "core"], sets: 3, reps: 12, weightLbs: null, durationSeconds: null, notes: "Keep chest up" },
      { name: "Romanian Deadlift", muscleGroups: ["hamstrings", "glutes", "back"], sets: 3, reps: 12, weightLbs: null, durationSeconds: null, notes: "Hinge at hips" },
      { name: "Walking Lunges", muscleGroups: ["quadriceps", "glutes"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Per leg" },
      { name: "Calf Raises", muscleGroups: ["calves"], sets: 3, reps: 15, weightLbs: null, durationSeconds: null, notes: "Pause at the top" },
      { name: "Glute Bridge", muscleGroups: ["glutes", "core"], sets: 3, reps: 15, weightLbs: null, durationSeconds: null, notes: "Squeeze at top" }
    ]
  },
  {
    id: "bodyweight-hiit",
    intent: "plan",
    title: "Bodyweight HIIT",
    durationMinutes: 30,
    summary: "High-intensity cardio and muscular endurance.",
    notes: "Perform as a circuit. 45 seconds work, 15 seconds rest. Repeat 4 times.",
    rationale: "High-intensity cardio and muscular endurance without equipment.",
    exercises: [
      { name: "Jumping Jacks", muscleGroups: ["cardio", "full_body"], sets: 4, reps: null, weightLbs: null, durationSeconds: 45, notes: "Light on feet" },
      { name: "Push-ups", muscleGroups: ["chest", "shoulders", "arms"], sets: 4, reps: null, weightLbs: null, durationSeconds: 45, notes: "Modify on knees if needed" },
      { name: "Bodyweight Squats", muscleGroups: ["quadriceps", "glutes", "cardio"], sets: 4, reps: null, weightLbs: null, durationSeconds: 45, notes: "Explosive up" },
      { name: "Mountain Climbers", muscleGroups: ["core", "cardio", "shoulders"], sets: 4, reps: null, weightLbs: null, durationSeconds: 45, notes: "Keep hips down" },
      { name: "Burpees", muscleGroups: ["full_body", "cardio", "core"], sets: 4, reps: null, weightLbs: null, durationSeconds: 45, notes: "Pace yourself" }
    ]
  },
  {
    id: "core-and-stretching",
    intent: "plan",
    title: "Core & Stretching",
    durationMinutes: 20,
    summary: "A foundational routine for core and flexibility.",
    notes: "Focus on controlled breathing and full range of motion.",
    rationale: "Improve core strength and flexibility.",
    exercises: [
      { name: "Cat-Cow Stretch", muscleGroups: ["core", "back", "mobility"], sets: 2, reps: 10, weightLbs: null, durationSeconds: null, notes: "Slow and controlled" },
      { name: "Plank", muscleGroups: ["core"], sets: 3, reps: null, weightLbs: null, durationSeconds: 60, notes: "Keep back straight" },
      { name: "Bird Dog", muscleGroups: ["core", "back"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Per side" },
      { name: "Dead Bug", muscleGroups: ["core"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Keep lower back flat" },
      { name: "Child's Pose", muscleGroups: ["mobility", "back"], sets: 1, reps: null, weightLbs: null, durationSeconds: 60, notes: "Relax and breathe" }
    ]
  },
  {
    id: "dumbbell-full-body",
    intent: "plan",
    title: "Dumbbell Full Body",
    durationMinutes: 45,
    summary: "A balanced total-body strength workout using dumbbells.",
    notes: "Rest 60–90 seconds between sets. Choose a challenging but manageable weight.",
    rationale: "Train every major movement pattern in one complete strength session.",
    exercises: [
      { name: "Goblet Squat", muscleGroups: ["quadriceps", "glutes", "core"], sets: 3, reps: 12, weightLbs: null, durationSeconds: null, notes: "Keep chest up" },
      { name: "Dumbbell Floor Press", muscleGroups: ["chest", "arms", "shoulders"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Use a slow descent" },
      { name: "Bent Over Row", muscleGroups: ["back", "arms", "core"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Pull toward your hip" },
      { name: "Romanian Deadlift", muscleGroups: ["hamstrings", "glutes", "back"], sets: 3, reps: 12, weightLbs: null, durationSeconds: null, notes: "Hinge at the hips" },
      { name: "Overhead Press", muscleGroups: ["shoulders", "arms", "core"], sets: 3, reps: 10, weightLbs: null, durationSeconds: null, notes: "Avoid arching your lower back" }
    ]
  },
  {
    id: "quick-mobility-recovery",
    intent: "plan",
    title: "Quick Mobility Recovery",
    durationMinutes: 15,
    summary: "A low-impact reset for hips, shoulders, and back.",
    notes: "Move slowly, breathe normally, and stay within a comfortable range.",
    rationale: "Restore comfortable movement on recovery days or after long periods of sitting.",
    exercises: [
      { name: "Cat-Cow Stretch", muscleGroups: ["mobility", "back", "core"], sets: 2, reps: 10, weightLbs: null, durationSeconds: null, notes: "Match each movement to your breath" },
      { name: "World's Greatest Stretch", muscleGroups: ["mobility", "glutes", "hamstrings"], sets: 2, reps: 5, weightLbs: null, durationSeconds: null, notes: "Complete each side" },
      { name: "Half-Kneeling Hip Flexor Stretch", muscleGroups: ["mobility", "quadriceps"], sets: 2, reps: null, weightLbs: null, durationSeconds: 30, notes: "Hold on each side" },
      { name: "Open Book Rotation", muscleGroups: ["mobility", "back", "shoulders"], sets: 2, reps: 8, weightLbs: null, durationSeconds: null, notes: "Complete each side" },
      { name: "Child's Pose", muscleGroups: ["mobility", "back"], sets: 1, reps: null, weightLbs: null, durationSeconds: 60, notes: "Relax and breathe" }
    ]
  }
];