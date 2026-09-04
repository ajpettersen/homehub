import React, { useState } from "react";
import { formatMuscleGroup, MUSCLE_GROUPS } from "./WorkoutHistory";
import { MuscleGroup, WorkoutDraft } from "@workspace/api-client-react";
import { Trash2, Plus, GripVertical } from "lucide-react";

export function EditableDraftWorkout({
  draft,
  onUpdate,
}: {
  draft: WorkoutDraft;
  onUpdate: (draft: WorkoutDraft) => void;
}) {
  const handleExChange = (index: number, field: string, value: any) => {
    const newEx = [...draft.exercises];
    newEx[index] = { ...newEx[index], [field]: value };
    onUpdate({ ...draft, exercises: newEx });
  };

  const handleRemoveEx = (index: number) => {
    const newEx = [...draft.exercises];
    newEx.splice(index, 1);
    onUpdate({ ...draft, exercises: newEx });
  };

  const handleAddEx = () => {
    onUpdate({
      ...draft,
      exercises: [
        ...draft.exercises,
        {
          name: "",
          muscleGroups: ["full_body" as MuscleGroup],
          sets: null,
          reps: null,
          weightLbs: null,
          durationSeconds: null,
          notes: null,
        }
      ]
    });
  };

  const toggleMuscle = (index: number, mg: MuscleGroup) => {
    const current = draft.exercises[index].muscleGroups;
    const next = current.includes(mg) ? current.filter(x => x !== mg) : [...current, mg];
    handleExChange(index, "muscleGroups", next.length ? next : ["full_body"]);
  };

  return (
    <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-sm space-y-4">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Title</label>
          <input 
            type="text" 
            value={draft.title} 
            onChange={e => onUpdate({ ...draft, title: e.target.value })}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 font-bold focus:outline-none focus:border-primary"
          />
        </div>
        
        {draft.rationale && (
          <div className="bg-primary/5 border border-primary/10 p-3 rounded-xl text-sm italic text-foreground/80">
            {draft.rationale}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Exercises</h4>
        
        {draft.exercises.map((ex, i) => (
          <div key={i} className="bg-background border border-border rounded-xl p-3 relative group">
            <button 
              onClick={() => handleRemoveEx(i)}
              className="absolute -right-2 -top-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            >
              <Trash2 className="w-3 h-3" />
            </button>

            <div className="space-y-3">
              <input 
                type="text" 
                value={ex.name} 
                onChange={e => handleExChange(i, "name", e.target.value)}
                placeholder="Exercise Name"
                className="w-full bg-transparent border-b border-border/50 px-1 py-1 font-bold text-sm focus:outline-none focus:border-primary"
              />

              <div className="flex flex-wrap gap-1">
                {MUSCLE_GROUPS.map((mg) => {
                  const active = ex.muscleGroups.includes(mg as MuscleGroup);
                  return (
                    <button
                      key={mg}
                      type="button"
                      onClick={() => toggleMuscle(i, mg as MuscleGroup)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors border ${
                        active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-border"
                      }`}
                    >
                      {formatMuscleGroup(mg)}
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-0.5 block">Sets</label>
                  <input type="number" value={ex.sets || ""} onChange={e => handleExChange(i, "sets", parseInt(e.target.value) || null)}
                    className="w-full bg-muted/30 border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-0.5 block">Reps</label>
                  <input type="number" value={ex.reps || ""} onChange={e => handleExChange(i, "reps", parseInt(e.target.value) || null)}
                    className="w-full bg-muted/30 border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-0.5 block">Lbs</label>
                  <input type="number" value={ex.weightLbs || ""} onChange={e => handleExChange(i, "weightLbs", parseInt(e.target.value) || null)}
                    className="w-full bg-muted/30 border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-0.5 block">Mins</label>
                  <input type="number" value={ex.durationSeconds ? Math.floor(ex.durationSeconds / 60) : ""} 
                    onChange={e => handleExChange(i, "durationSeconds", e.target.value ? parseFloat(e.target.value) * 60 : null)}
                    className="w-full bg-muted/30 border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-primary" />
                </div>
              </div>
            </div>
          </div>
        ))}

        <button onClick={handleAddEx}
          className="w-full py-2 border-2 border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary rounded-xl flex items-center justify-center gap-1 text-xs font-bold transition-colors">
          <Plus className="w-3 h-3" /> Add Exercise
        </button>
      </div>
    </div>
  );
}
