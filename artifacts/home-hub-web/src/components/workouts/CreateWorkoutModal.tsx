import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Dumbbell, Sparkles, X, Activity } from "lucide-react";
import { 
  useCreateWorkout, 
  useDraftWorkout, 
  useAddExercise, 
  getGetWorkoutsQueryKey,
  WorkoutDraft
} from "@workspace/api-client-react";
import { EditableDraftWorkout } from "./EditableDraftWorkout";

export function CreateWorkoutModal({ onClose, defaultMember, members }: { onClose: () => void; defaultMember: any | null; members: any[] }) {
  const queryClient = useQueryClient();
  const createWorkout = useCreateWorkout();
  const draftWorkout = useDraftWorkout();
  const addExercise = useAddExercise();
  
  const [tab, setTab] = useState<"manual" | "ai">("manual");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    defaultMember ? [defaultMember.id] : [members[0]?.id].filter(Boolean)
  );
  
  // Manual form
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  // AI Draft form
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [isLogging, setIsLogging] = useState(false);

  const toggleMember = (id: string) => {
    setSelectedMemberIds(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Must have at least one
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || selectedMemberIds.length === 0) return;

    createWorkout.mutate(
      {
        data: {
          participantIds: selectedMemberIds,
          title,
          workoutDate: date,
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

  const handleGenerateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || selectedMemberIds.length === 0) return;

    try {
      const result = await draftWorkout.mutateAsync({
        data: {
          prompt,
          participantIds: selectedMemberIds
        }
      });
      setDraft(result);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogDraft = async () => {
    if (!draft || selectedMemberIds.length === 0) return;
    setIsLogging(true);
    
    try {
      const newWorkout = await createWorkout.mutateAsync({
        data: {
          participantIds: selectedMemberIds,
          title: draft.title,
          workoutDate: format(new Date(), "yyyy-MM-dd"),
          durationMinutes: draft.durationMinutes,
          notes: draft.notes || null,
        }
      });

      for (const ex of draft.exercises) {
        if (!ex.name) continue;
        await addExercise.mutateAsync({
          id: newWorkout.id,
          data: {
            name: ex.name,
            muscleGroups: ex.muscleGroups,
            sets: ex.sets || null,
            reps: ex.reps || null,
            weightLbs: ex.weightLbs || null,
            durationSeconds: ex.durationSeconds || null,
            notes: ex.notes || null
          }
        });
      }

      queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/60 p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-sm animate-in fade-in duration-200 sm:p-4">
      <div className={`flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl animate-in zoom-in-95 duration-200 ${draft ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20 shrink-0">
          <h2 className="font-serif font-bold text-xl flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-primary" />
            Log Workout
          </h2>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-border shrink-0">
          <button 
            onClick={() => setTab("manual")} 
            className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${tab === "manual" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Manual Entry
          </button>
          <button 
            onClick={() => setTab("ai")} 
            className={`flex-1 py-3 text-sm font-bold border-b-2 flex items-center justify-center gap-1.5 transition-colors ${tab === "ai" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Sparkles className="w-4 h-4" /> AI Draft
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {members.length > 1 && (
            <div className="mb-4">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Logging For</label>
              <div className="flex gap-2">
                {members.map(m => {
                  const active = selectedMemberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all border-2 ${
                        active ? "border-transparent text-white shadow-sm" : "border-border text-muted-foreground bg-background hover:border-border/80"
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

          {tab === "manual" && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Workout Title</label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Upper Body Power"
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
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Duration (mins)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[80px] resize-none"
                  placeholder="How did it feel?"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 font-bold rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
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
          )}

          {tab === "ai" && !draft && (
            <form onSubmit={handleGenerateDraft} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">What do you want to do?</label>
                <textarea
                  autoFocus
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[120px] resize-none text-sm"
                  placeholder="E.g., I have 30 minutes and a pair of 20lb dumbbells. I want a quick chest and back circuit."
                />
              </div>
              <button
                type="submit"
                disabled={draftWorkout.isPending || !prompt.trim() || selectedMemberIds.length === 0}
                className="w-full py-3 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20 flex items-center justify-center gap-2"
              >
                {draftWorkout.isPending ? "Generating Draft..." : <><Sparkles className="w-5 h-5" /> Generate Draft</>}
              </button>
            </form>
          )}

          {tab === "ai" && draft && (
            <div className="space-y-4 animate-in slide-in-from-bottom-2">
              <EditableDraftWorkout draft={draft} onUpdate={setDraft} />
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={isLogging}
                  className="flex-1 py-3 font-bold rounded-xl border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={handleLogDraft}
                  disabled={isLogging}
                  className="flex-1 py-3 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20 flex items-center justify-center gap-2"
                >
                  {isLogging ? "Logging..." : <><Activity className="w-5 h-5" /> Log This Workout</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
