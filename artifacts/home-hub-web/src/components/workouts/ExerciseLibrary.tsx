import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Search, BookOpen, Sparkles } from "lucide-react";
import {
  useListExerciseLibrary,
  useCreateLibraryExercise,
  useUpdateLibraryExercise,
  useDeleteLibraryExercise,
  getListExerciseLibraryQueryKey,
  useGetExerciseHistory,
  getGetExerciseHistoryQueryKey,
  MuscleGroup
} from "@workspace/api-client-react";
import { MUSCLE_GROUPS, formatMuscleGroup } from "./WorkoutHistory";

function ExerciseHistory({ exerciseId, onUse }: { exerciseId: string; onUse: (exercise: any) => void }) {
  const { data, isLoading, isError } = useGetExerciseHistory(exerciseId, { query: { queryKey: getGetExerciseHistoryQueryKey(exerciseId) } });
  if (isLoading) return <p className="mt-2 text-xs text-muted-foreground">Loading completed appearances…</p>;
  if (isError) return <p className="mt-2 text-xs text-destructive">Could not load exercise history.</p>;
  return <div className="mt-3 rounded-lg bg-muted/40 p-3" data-testid={`exercise-history-${exerciseId}`}>
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{data?.completedAppearanceCount ?? 0} completed appearances</p>
    {data?.appearances.length ? <><button data-testid={`button-add-history-exercise-${exerciseId}`} onClick={() => onUse(data.appearances[0].exercise)} className="mt-2 rounded-md text-xs font-bold text-primary hover:underline">+ Add latest setup to draft</button><div className="mt-2 space-y-2">{data.appearances.map(appearance => <div key={`${appearance.workoutId}-${appearance.exercise.id}`} className="border-t border-border/60 pt-2 text-xs"><div className="flex justify-between gap-2"><strong>{appearance.title}</strong><span className="whitespace-nowrap text-muted-foreground">{new Date(`${appearance.workoutDate}T12:00:00`).toLocaleDateString()}</span></div><p className="mt-1 text-muted-foreground">{appearance.participants.map(person => person.name).join(" + ")} · {[appearance.exercise.sets && `${appearance.exercise.sets} × ${appearance.exercise.reps ?? "—"}`, appearance.exercise.weightLbs && `${appearance.exercise.weightLbs} lb`, appearance.exercise.notes].filter(Boolean).join(" · ") || "Details not recorded"}</p></div>)}</div></> : <p className="mt-2 text-xs text-muted-foreground">No completed appearances yet.</p>}
  </div>;
}

function LibraryExerciseForm({
  initial,
  onSave,
  onCancel,
  saving
}: {
  initial: { name: string, muscleGroups: MuscleGroup[] },
  onSave: (name: string, muscleGroups: MuscleGroup[]) => void,
  onCancel: () => void,
  saving: boolean
}) {
  const [name, setName] = useState(initial.name);
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>(initial.muscleGroups);

  const toggleMuscle = (mg: MuscleGroup) => {
    setSelectedMuscles(prev => prev.includes(mg) ? prev.filter(x => x !== mg) : [...prev, mg]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedMuscles.length === 0) return;
    onSave(name, selectedMuscles);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card border-2 border-primary/20 rounded-xl p-4 shadow-sm mb-4">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Exercise Name</label>
          <input autoFocus type="text" required value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="e.g. Barbell Squat" />
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

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2 font-bold rounded-lg border border-border text-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim() || selectedMuscles.length === 0}
            className="flex-1 py-2 font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function ExerciseLibrary({ onUse }: { onUse?: (exercise: any) => void }) {
  const queryClient = useQueryClient();
  const { data: exercises, isLoading } = useListExerciseLibrary({
    query: { queryKey: getListExerciseLibraryQueryKey() }
  });
  
  const createExercise = useCreateLibraryExercise();
  const updateExercise = useUpdateLibraryExercise();
  const deleteExercise = useDeleteLibraryExercise();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = (name: string, muscleGroups: MuscleGroup[]) => {
    createExercise.mutate(
      { data: { name, muscleGroups } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListExerciseLibraryQueryKey() });
          setAdding(false);
          setErrorMsg(null);
        },
        onError: (err: any) => setErrorMsg(err.message || "Failed to create exercise")
      }
    );
  };

  const handleUpdate = (id: string, name: string, muscleGroups: MuscleGroup[]) => {
    updateExercise.mutate(
      { id, data: { name, muscleGroups } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListExerciseLibraryQueryKey() });
          setEditingId(null);
          setErrorMsg(null);
        },
        onError: (err: any) => setErrorMsg(err.message || "Failed to update exercise")
      }
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    deleteExercise.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListExerciseLibraryQueryKey() });
          setErrorMsg(null);
        },
        onError: (err: any) => {
          // If it's referenced, the API should return 409
          setErrorMsg(`Cannot delete ${name}: ${err.message || "It may be used in past workouts."}`);
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  // Filter & group
  const filtered = (exercises || []).filter(ex => ex.name.toLowerCase().includes(searchTerm.toLowerCase()));
  
  // Group by first muscle group
  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach(ex => {
    const primaryMuscle = ex.muscleGroups[0] || "full_body";
    if (!grouped[primaryMuscle]) grouped[primaryMuscle] = [];
    grouped[primaryMuscle].push(ex);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight">Exercise Library</h2>
            <p className="text-xs text-muted-foreground">{exercises?.length || 0} canonical exercises</p>
          </div>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search..." 
              className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          {!adding && (
            <button 
              onClick={() => { setAdding(true); setEditingId(null); setErrorMsg(null); }}
              className="flex items-center justify-center w-10 h-10 sm:w-auto sm:px-4 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-5 h-5 sm:mr-1" />
              <span className="hidden sm:inline font-bold text-sm">Add</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-destructive/10 border-l-4 border-destructive p-4 rounded-r-lg text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {adding && (
        <LibraryExerciseForm 
          initial={{ name: "", muscleGroups: ["full_body" as MuscleGroup] }}
          onSave={handleCreate}
          onCancel={() => setAdding(false)}
          saving={createExercise.isPending}
        />
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border border-dashed rounded-2xl">
          <p>No exercises found.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {MUSCLE_GROUPS.map(mg => {
            const groupExercises = grouped[mg];
            if (!groupExercises || groupExercises.length === 0) return null;
            
            return (
              <div key={mg} className="space-y-3">
                <h3 className="font-bold text-lg text-foreground capitalize flex items-center gap-2 border-b border-border pb-2">
                  {formatMuscleGroup(mg)}
                  <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    {groupExercises.length}
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groupExercises.map(ex => (
                    editingId === ex.id ? (
                      <div key={ex.id} className="md:col-span-2">
                        <LibraryExerciseForm 
                          initial={{ name: ex.name, muscleGroups: ex.muscleGroups }}
                          onSave={(name, muscles) => handleUpdate(ex.id, name, muscles)}
                          onCancel={() => setEditingId(null)}
                          saving={updateExercise.isPending}
                        />
                      </div>
                    ) : (
                      <div key={ex.id} className="group p-3 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all">
                        <div className="flex items-center justify-between">
                        <button data-testid={`button-exercise-history-${ex.id}`} onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)} className="flex-1 text-left">
                          <p className="font-bold text-sm">{ex.name}</p>
                          {ex.muscleGroups.length > 1 && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Also: {ex.muscleGroups.slice(1).map(m => formatMuscleGroup(m)).join(", ")}
                            </p>
                          )}
                        </button>
                        <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                          <button type="button" onClick={() => { setEditingId(ex.id); setAdding(false); setErrorMsg(null); }}
                            aria-label={`Edit ${ex.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-8">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => handleDelete(ex.id, ex.name)}
                            aria-label={`Delete ${ex.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        </div>
                        {expandedId === ex.id && (
                          <div className="border-t border-border/60 mt-3 pt-3">
                            <button onClick={() => onUse?.({ name: ex.name, muscleGroups: ex.muscleGroups, sets: null, reps: null, weightLbs: null, durationSeconds: null, notes: null })} className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary/10 py-2 text-sm font-bold text-primary hover:bg-primary/20">
                              <Sparkles className="w-4 h-4" /> Add to Coach Draft
                            </button>
                            <ExerciseHistory exerciseId={ex.id} onUse={onUse || (() => {})} />
                          </div>
                        )}
                      </div>
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
