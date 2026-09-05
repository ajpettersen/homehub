import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity, Clock, ChevronDown, ChevronUp, Trash2, Plus, Flame, X
} from "lucide-react";
import {
  useGetWorkout,
  useDeleteWorkout,
  useAddExercise,
  useDeleteExercise,
  getGetWorkoutQueryKey,
  getGetWorkoutsQueryKey,
  MuscleGroup
} from "@workspace/api-client-react";

export const MUSCLE_GROUPS = [
  "full_body", "chest", "back", "shoulders", "arms", "core",
  "glutes", "quadriceps", "hamstrings", "calves", "cardio", "mobility"
] as const;

export function formatMuscleGroup(mg: string) {
  return mg.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
}

function ExerciseRow({ exercise, onDelete }: { exercise: any; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded-lg border border-border/50 group">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-sm">{exercise.name}</p>
          {exercise.muscleGroups?.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {exercise.muscleGroups.map((mg: string) => (
                <span key={mg} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">
                  {formatMuscleGroup(mg)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 font-medium">
          {exercise.sets != null && exercise.reps != null && (
            <span>{exercise.sets} sets × {exercise.reps} reps</span>
          )}
          {exercise.weightLbs != null && (
            <span>{exercise.weightLbs} lbs</span>
          )}
          {exercise.durationSeconds != null && (
            <span>{Math.floor(exercise.durationSeconds / 60)}m {exercise.durationSeconds % 60}s</span>
          )}
        </div>
        {exercise.notes && <p className="text-xs text-muted-foreground mt-1 italic">{exercise.notes}</p>}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        title="Delete exercise"
        aria-label={`Delete ${exercise.name}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function AddExerciseForm({ workoutId, onAdded, onCancel }: { workoutId: string; onAdded: () => void; onCancel: () => void }) {
  const addExercise = useAddExercise();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [durationMins, setDurationMins] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>([]);

  const toggleMuscle = (mg: MuscleGroup) => {
    setSelectedMuscles(prev => prev.includes(mg) ? prev.filter(x => x !== mg) : [...prev, mg]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addExercise.mutate(
      {
        id: workoutId,
        data: {
          name,
          muscleGroups: selectedMuscles.length > 0 ? selectedMuscles : ["full_body" as MuscleGroup],
          sets: sets ? parseInt(sets) : null,
          reps: reps ? parseInt(reps) : null,
          weightLbs: weight ? parseInt(weight) : null,
          durationSeconds: durationMins ? parseFloat(durationMins) * 60 : null,
          notes: notes || null,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWorkoutQueryKey(workoutId) });
          queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
          onAdded();
        }
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card border-2 border-primary/20 rounded-xl p-4 shadow-sm mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-sm flex items-center gap-2 text-primary">
          <Activity className="w-4 h-4" />
          Add Exercise
        </h4>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Exercise Name</label>
          <input autoFocus type="text" required value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="e.g. Bench Press" />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Target Muscles</label>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.map((mg) => {
              const active = selectedMuscles.includes(mg as MuscleGroup);
              return (
                <button
                  key={mg}
                  type="button"
                  onClick={() => toggleMuscle(mg as MuscleGroup)}
                  className={`px-2 py-1 rounded-md text-xs font-bold transition-colors border ${
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {formatMuscleGroup(mg)}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Sets</label>
            <input type="number" min="1" value={sets} onChange={(e) => setSets(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="3" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Reps</label>
            <input type="number" min="1" value={reps} onChange={(e) => setReps(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="10" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Weight (lbs)</label>
            <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="135" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Duration (mins)</label>
            <input type="number" step="0.5" value={durationMins} onChange={(e) => setDurationMins(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="15" />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="Felt heavy today" />
        </div>

        <div className="pt-2">
          <button type="submit" disabled={addExercise.isPending}
            className="w-full bg-primary text-primary-foreground font-bold rounded-lg py-2.5 hover:bg-primary/90 transition-colors disabled:opacity-50">
            {addExercise.isPending ? "Adding..." : "Save Exercise"}
          </button>
        </div>
      </div>
    </form>
  );
}

function WorkoutDetailCard({ workout, showMember }: { workout: any; showMember?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  
  const queryClient = useQueryClient();
  const deleteWorkout = useDeleteWorkout();
  const deleteExercise = useDeleteExercise();

  const { data: detail, isLoading } = useGetWorkout(workout.id, {
    query: {
      enabled: expanded,
      queryKey: getGetWorkoutQueryKey(workout.id)
    }
  });

  const handleDeleteWorkout = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this workout?")) {
      deleteWorkout.mutate(
        { id: workout.id },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() }) }
      );
    }
  };

  const handleDeleteExercise = (exerciseId: string) => {
    if (confirm("Delete this exercise?")) {
      deleteExercise.mutate(
        { id: exerciseId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWorkoutQueryKey(workout.id) });
            queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
          }
        }
      );
    }
  };

  return (
    <div className={`bg-card rounded-2xl border-2 transition-all duration-300 overflow-hidden ${expanded ? "border-primary/40 shadow-md" : "border-border shadow-sm hover:border-border/80"}`}>
      <div className="p-4 cursor-pointer flex items-start gap-4 select-none" onClick={() => setExpanded(!expanded)}>
        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Flame className="w-6 h-6" />
        </div>
        
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-serif font-bold text-lg text-foreground truncate">{workout.title}</h3>
            <span className="text-xs font-bold text-muted-foreground whitespace-nowrap bg-muted px-2 py-1 rounded-md">
              {format(new Date(workout.workoutDate), "MMM d, yyyy")}
            </span>
          </div>
          
          <div className="flex items-center gap-4 mt-1.5 text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4" />
              {workout.exerciseCount} exercises
            </span>
            {workout.durationMinutes && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {workout.durationMinutes} min
              </span>
            )}
            
            {showMember && workout.participants && workout.participants.length > 0 ? (
              <div className="ml-auto flex gap-1 items-center">
                {workout.participants.map((p: any) => (
                  <span key={p.id} className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider shadow-sm" style={{ backgroundColor: p.color || "var(--color-primary)" }}>
                    {p.name}
                  </span>
                ))}
              </div>
            ) : showMember && workout.memberName ? (
              <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider shadow-sm" style={{ backgroundColor: workout.memberColor || "var(--color-primary)" }}>
                {workout.memberName}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 shrink-0">
          <button onClick={handleDeleteWorkout} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="text-muted-foreground">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/10 p-4 pt-2">
          {workout.notes && (
            <p className="text-sm text-foreground/80 italic mb-4 mt-2 border-l-2 border-primary/40 pl-3 py-1">
              "{workout.notes}"
            </p>
          )}

          <div className="mt-4">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Exercises</h4>
            
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-14 bg-muted rounded-lg w-full"></div>
                <div className="h-14 bg-muted rounded-lg w-full"></div>
              </div>
            ) : detail?.exercises?.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/50 text-center">
                No exercises logged yet.
              </p>
            ) : (
              <div className="space-y-2">
                {detail?.exercises?.map((ex: any) => (
                  <ExerciseRow key={ex.id} exercise={ex} onDelete={() => handleDeleteExercise(ex.id)} />
                ))}
              </div>
            )}
          </div>

          {addingExercise ? (
            <AddExerciseForm workoutId={workout.id} onAdded={() => setAddingExercise(false)} onCancel={() => setAddingExercise(false)} />
          ) : (
            <button onClick={() => setAddingExercise(true)}
              className="mt-4 w-full py-2.5 rounded-lg border-2 border-dashed border-primary/30 text-primary font-bold text-sm hover:bg-primary/5 hover:border-primary/50 transition-colors flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Add Exercise
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkoutHistory({ workouts, bothSelected, parents, onLogWorkout }: { workouts: any[], bothSelected: boolean, parents: any[], onLogWorkout: () => void }) {
  if (workouts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-border rounded-3xl bg-card">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-serif font-bold text-xl mb-2">No workouts logged yet</h3>
        <p className="text-muted-foreground max-w-md mb-6">
          Time to get moving! Log a workout manually, let the AI coach suggest one, or generate a weekly plan.
        </p>
        <button
          onClick={onLogWorkout}
          className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
        >
          Log First Workout
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {workouts.map(workout => (
        <WorkoutDetailCard key={workout.id} workout={workout} showMember={bothSelected} />
      ))}
    </div>
  );
}
