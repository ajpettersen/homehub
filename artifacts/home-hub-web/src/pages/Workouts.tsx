import React, { useState, useRef } from "react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { usePreferences } from "@/context/PreferencesContext";
import {
  useGetWorkouts,
  useCreateWorkout,
  useGetWorkout,
  useDeleteWorkout,
  useAddExercise,
  useDeleteExercise,
  useRecommendWorkout,
  useGetFamilyMembers,
  getGetWorkoutsQueryKey,
  getGetWorkoutQueryKey,
  getGetFamilyMembersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dumbbell,
  Plus,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Activity,
  Flame,
  X
} from "lucide-react";

// --- Components ---

function ExerciseRow({ exercise, onDelete }: { exercise: any; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-muted/40 rounded-lg border border-border/50 group">
      <div className="flex-1">
        <p className="font-bold text-sm">{exercise.name}</p>
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
        onClick={onDelete}
        className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Delete exercise"
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addExercise.mutate(
      {
        id: workoutId,
        data: {
          name,
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
          queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() }); // to update count
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

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Exercise Name</label>
          <input
            autoFocus
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="e.g. Bench Press, Treadmill"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Sets</label>
            <input
              type="number"
              min="1"
              value={sets}
              onChange={(e) => setSets(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="e.g. 3"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Reps</label>
            <input
              type="number"
              min="1"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="e.g. 10"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Weight (lbs)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="e.g. 135"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Duration (mins)</label>
            <input
              type="number"
              step="0.5"
              value={durationMins}
              onChange={(e) => setDurationMins(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="e.g. 15"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Notes (Optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="e.g. Felt heavy today"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={addExercise.isPending}
            className="w-full bg-primary text-primary-foreground font-bold rounded-lg py-2.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
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

  // Only fetch details when expanded
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
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
          }
        }
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
      <div 
        className="p-4 cursor-pointer flex items-start gap-4 select-none"
        onClick={() => setExpanded(!expanded)}
      >
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
            {showMember && workout.memberName && (
              <span
                className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: workout.memberColor || "var(--color-primary)" }}
              >
                {workout.memberName}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 shrink-0">
          <button
            onClick={handleDeleteWorkout}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
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
                  <ExerciseRow 
                    key={ex.id} 
                    exercise={ex} 
                    onDelete={() => handleDeleteExercise(ex.id)} 
                  />
                ))}
              </div>
            )}
          </div>

          {addingExercise ? (
            <AddExerciseForm 
              workoutId={workout.id} 
              onAdded={() => setAddingExercise(false)} 
              onCancel={() => setAddingExercise(false)} 
            />
          ) : (
            <button
              onClick={() => setAddingExercise(true)}
              className="mt-4 w-full py-2.5 rounded-lg border-2 border-dashed border-primary/30 text-primary font-bold text-sm hover:bg-primary/5 hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Exercise
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Modals ---

function CreateWorkoutModal({ onClose, defaultMember, members }: { onClose: () => void; defaultMember: any | null; members: any[] }) {
  const queryClient = useQueryClient();
  const createWorkout = useCreateWorkout();
  
  const [selectedMember, setSelectedMember] = useState<any>(defaultMember ?? members[0] ?? null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedMember) return;

    createWorkout.mutate(
      {
        data: {
          memberId: selectedMember.id,
          title,
          workoutDate: new Date(date).toISOString(),
          durationMinutes: duration ? parseInt(duration) : null,
          notes: notes || null
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
          onClose();
        }
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-border animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
          <h2 className="font-serif font-bold text-xl flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-primary" />
            Log Workout
          </h2>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {members.length > 1 && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Logging For</label>
              <div className="flex gap-2">
                {members.map(m => {
                  const active = selectedMember?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMember(m)}
                      className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all border-2 ${
                        active ? "border-transparent text-white" : "border-border text-muted-foreground bg-background hover:border-border/80"
                      }`}
                      style={active ? { backgroundColor: m.color || "var(--color-primary)" } : {}}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Workout Title</label>
            <input
              autoFocus
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="e.g. Upper Body Power, Morning Run"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Duration (mins)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[80px] resize-none"
              placeholder="How did it feel?"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 font-bold rounded-xl border-2 border-border text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createWorkout.isPending}
              className="flex-1 py-3 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20"
            >
              {createWorkout.isPending ? "Creating..." : "Start Workout"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AIRecommendationModal({ onClose, activeMember, members, onMemberChange }: {
  onClose: () => void;
  activeMember: any;
  members: any[];
  onMemberChange: (m: any) => void;
}) {
  const queryClient = useQueryClient();
  const recommendWorkout = useRecommendWorkout();
  const createWorkout = useCreateWorkout();
  const addExercise = useAddExercise();
  
  const [recommendation, setRecommendation] = useState<any>(null);
  const [isLogging, setIsLogging] = useState(false);

  // Auto-fetch on mount or when activeMember changes
  const hasFetched = useRef(false);
  if (!hasFetched.current && activeMember) {
    hasFetched.current = true;
    recommendWorkout.mutate(
      { data: { memberId: activeMember.id, memberName: activeMember.name } },
      {
        onSuccess: (data) => setRecommendation(data)
      }
    );
  }

  const handleSwitchMember = (m: any) => {
    if (m.id === activeMember?.id) return;
    onMemberChange(m);
    hasFetched.current = false;
    setRecommendation(null);
  };

  const handleLogRecommendation = async () => {
    if (!recommendation || !activeMember) return;
    setIsLogging(true);
    
    try {
      // 1. Create Workout
      const newWorkout = await createWorkout.mutateAsync({
        data: {
          memberId: activeMember.id,
          title: recommendation.title,
          workoutDate: new Date().toISOString(),
          notes: "AI Recommended: " + recommendation.rationale
        }
      });

      // 2. Add Exercises
      for (const ex of recommendation.exercises) {
        await addExercise.mutateAsync({
          id: newWorkout.id,
          data: {
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            weightLbs: ex.weightLbs,
            durationSeconds: ex.durationSeconds,
            notes: ex.notes
          }
        });
      }

      queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
      onClose();
    } catch (err) {
      console.error(err);
      setIsLogging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border-2 border-primary/20 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]">
        <div className="p-6 pb-4 bg-gradient-to-br from-primary/10 to-transparent border-b border-border flex justify-between items-start shrink-0">
          <div>
            <h2 className="font-serif font-bold text-2xl flex items-center gap-2 text-primary">
              <Sparkles className="w-6 h-6" />
              AI Coach
            </h2>
            {members.length > 1 ? (
              <div className="flex gap-1.5 mt-2">
                {members.map(m => {
                  const active = activeMember?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSwitchMember(m)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                        active ? "border-transparent text-white shadow-sm" : "border-border/60 text-muted-foreground bg-white/40 hover:bg-white/60"
                      }`}
                      style={active ? { backgroundColor: m.color || "var(--color-primary)" } : {}}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm font-medium text-muted-foreground mt-1">
                Personalized for {activeMember?.name}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-colors bg-white/50 backdrop-blur-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {recommendWorkout.isPending ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Sparkles className="w-12 h-12 text-primary/40 animate-pulse mb-4" />
              <p className="font-medium animate-pulse">Analyzing training history...</p>
            </div>
          ) : recommendWorkout.isError ? (
            <div className="py-8 text-center text-destructive">
              <p className="font-bold mb-2">Failed to get recommendation</p>
              <button onClick={() => onClose()} className="px-4 py-2 bg-muted rounded-lg text-sm">Close</button>
            </div>
          ) : recommendation ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div>
                <h3 className="font-serif font-bold text-xl mb-2">{recommendation.title}</h3>
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-sm font-medium leading-relaxed">
                    {recommendation.rationale}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Suggested Routine</h4>
                <div className="space-y-3">
                  {recommendation.exercises.map((ex: any, i: number) => (
                    <div key={i} className="bg-background border-2 border-border rounded-xl p-3 shadow-sm">
                      <p className="font-bold text-sm">{ex.name}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1 font-medium">
                        {ex.sets != null && ex.reps != null && (
                          <span>{ex.sets} sets × {ex.reps} reps</span>
                        )}
                        {ex.durationSeconds != null && (
                          <span>{Math.floor(ex.durationSeconds / 60)}m {ex.durationSeconds % 60}s</span>
                        )}
                        {ex.weightLbs != null && (
                          <span>{ex.weightLbs} lbs</span>
                        )}
                      </div>
                      {ex.notes && <p className="text-xs text-foreground/70 mt-1.5 italic bg-muted/30 p-1.5 rounded-md">"{ex.notes}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {recommendation && (
          <div className="p-4 border-t border-border bg-muted/20 shrink-0">
            <button
              onClick={handleLogRecommendation}
              disabled={isLogging}
              className="w-full py-3.5 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/30 flex items-center justify-center gap-2 text-lg"
            >
              {isLogging ? (
                "Logging Workout..."
              ) : (
                <>
                  <Activity className="w-5 h-5" />
                  Log This Workout
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// --- Main Page ---

export default function Workouts() {
  const { data: allMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { activeMember } = useActiveMember();
  const { preferences } = usePreferences();

  // Only AJ and Emily (parents) can use workouts
  const parents = allMembers?.filter(m => m.role === "parent") ?? [];

  // Which parents are currently selected for viewing — default both once loaded
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Once parents load, default-select both
  React.useEffect(() => {
    if (parents.length > 0 && selectedIds.length === 0) {
      const activeParent = preferences.tabs.workouts.defaultScope === "active"
        ? parents.find(parent => parent.id === activeMember?.id)
        : undefined;
      setSelectedIds(activeParent ? [activeParent.id] : parents.map(p => p.id));
    }
  }, [parents.length, preferences.tabs.workouts.defaultScope, activeMember?.id]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [aiMember, setAiMember] = useState<any>(null); // which member to get AI rec for

  const bothSelected = selectedIds.length === parents.length && parents.length > 1;
  const singleSelected = selectedIds.length === 1 ? parents.find(p => p.id === selectedIds[0]) : null;

  // When both selected fetch all; when one selected filter by that id
  const queryMemberId = bothSelected ? undefined : (selectedIds[0] ?? undefined);
  const { data: allWorkouts, isLoading } = useGetWorkouts(
    queryMemberId ? { memberId: queryMemberId } : {},
    { query: { queryKey: getGetWorkoutsQueryKey(queryMemberId ? { memberId: queryMemberId } : {}) } }
  );

  // Filter to only selected parent IDs (guards against "all workouts" returning kids etc.)
  const workouts = allWorkouts?.filter(w => selectedIds.includes(w.memberId)) ?? [];

  const toggleMember = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        // Don't allow deselecting the last one
        if (prev.length === 1) return prev;
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  // For "Log Workout" — default to single selected member; if both, user picks in modal
  const defaultLogMember = singleSelected ?? null;

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight">
            Training Journal
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            {bothSelected ? "Showing workouts for everyone" : singleSelected ? `Showing ${singleSelected.name}'s workouts` : "Select who to view"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (singleSelected) {
                setAiMember(singleSelected);
              } else {
                // Both selected — default to first parent for AI
                setAiMember(parents[0] ?? null);
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors border border-primary/20"
          >
            <Sparkles className="w-4 h-4" />
            AI Coach
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-bold hover:bg-foreground/90 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Log Workout
          </button>
        </div>
      </header>

      {/* Member toggle */}
      {parents.length > 0 && (
        <div className="flex gap-2 mb-6">
          {parents.map(parent => {
            const active = selectedIds.includes(parent.id);
            return (
              <button
                key={parent.id}
                onClick={() => toggleMember(parent.id)}
                data-testid={`toggle-member-${parent.id}`}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border-2 ${
                  active
                    ? "border-transparent text-white shadow-md"
                    : "border-border text-muted-foreground bg-card hover:border-border/80"
                }`}
                style={active ? { backgroundColor: parent.color || "var(--color-primary)" } : {}}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${active ? "bg-white/20" : "text-white"}`}
                  style={!active ? { backgroundColor: parent.color || "var(--color-primary)" } : {}}
                >
                  {parent.name.charAt(0)}
                </div>
                {parent.name}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : workouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-border rounded-3xl bg-card">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Dumbbell className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-serif font-bold text-xl mb-2">No workouts logged yet</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Time to get moving! Log a workout manually or let the AI coach suggest one.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
          >
            Log First Workout
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {workouts.map(workout => (
            <WorkoutDetailCard key={workout.id} workout={workout} showMember={bothSelected} />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateWorkoutModal
          defaultMember={defaultLogMember}
          members={parents}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {aiMember && (
        <AIRecommendationModal
          activeMember={aiMember}
          members={parents}
          onMemberChange={setAiMember}
          onClose={() => setAiMember(null)}
        />
      )}
    </div>
  );
}
