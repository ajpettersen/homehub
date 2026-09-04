import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Settings, Sparkles, Check, RefreshCw } from "lucide-react";
import { format, addDays } from "date-fns";
import {
  useGetWorkoutPreferences,
  useUpdateWorkoutPreferences,
  useGenerateWorkoutWeekPlan,
  useSaveWorkoutWeekPlan,
  getGetWorkoutPreferencesQueryKey,
  getGetWorkoutsQueryKey,
  WorkoutPreferencesInput,
  WorkoutWeekPlanItem,
  WorkoutDraft
} from "@workspace/api-client-react";
import { EditableDraftWorkout } from "./EditableDraftWorkout";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WorkoutWeeklyPlan({ participantIds, onPlanSaved }: { participantIds: string[], onPlanSaved: () => void }) {
  const queryClient = useQueryClient();
  const { data: prefData, isLoading: prefLoading } = useGetWorkoutPreferences({
    query: { queryKey: getGetWorkoutPreferencesQueryKey() }
  });
  
  const updatePref = useUpdateWorkoutPreferences();
  const generatePlan = useGenerateWorkoutWeekPlan();
  const savePlan = useSaveWorkoutWeekPlan();

  const [preferences, setPreferences] = useState<WorkoutPreferencesInput>({
    daysOfWeek: [1, 3, 5],
    goals: "Build strength and stay active",
    sessionDurationMinutes: 45,
    equipment: "Dumbbells, resistance bands",
    limitations: "None",
    notes: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  const [showSettings, setShowSettings] = useState(false);
  const [planItems, setPlanItems] = useState<WorkoutWeekPlanItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prefData) {
      setPreferences({
        daysOfWeek: prefData.daysOfWeek || [],
        goals: prefData.goals || "",
        sessionDurationMinutes: prefData.sessionDurationMinutes || 45,
        equipment: prefData.equipment || "",
        limitations: prefData.limitations || "",
        notes: prefData.notes || "",
        timezone: prefData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    }
  }, [prefData]);

  const handleSavePref = async (e: React.FormEvent) => {
    e.preventDefault();
    await updatePref.mutateAsync({ data: preferences });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutPreferencesQueryKey() });
    setShowSettings(false);
  };

  const handleGenerate = async () => {
    if (participantIds.length === 0) return;
    // The API derives this from the saved household IANA timezone, not the browser clock.
    const weekStart = prefData?.currentWeekStart;
    if (!weekStart) return;
    try {
      const data = await generatePlan.mutateAsync({
        data: {
          weekStart,
          participantIds,
          preferences
        }
      });
      setPlanItems(data.items);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePlan = async () => {
    if (!planItems) return;
    setSaving(true);
    try {
      await savePlan.mutateAsync({
        data: {
          items: planItems
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
      setPlanItems(null);
      onPlanSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (index: number, newDraft: WorkoutDraft) => {
    if (!planItems) return;
    const newItems = [...planItems];
    newItems[index] = { ...newItems[index], workout: newDraft };
    setPlanItems(newItems);
  };

  const toggleDay = (d: number) => {
    setPreferences(prev => {
      const days = prev.daysOfWeek.includes(d) ? prev.daysOfWeek.filter(x => x !== d) : [...prev.daysOfWeek, d];
      return { ...prev, daysOfWeek: days };
    });
  };

  if (prefLoading) {
    return <div className="animate-pulse h-64 bg-muted rounded-3xl" />;
  }

  return (
    <div className="space-y-6">
      {!planItems ? (
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="font-serif font-bold text-2xl mb-1">Weekly AI Planner</h2>
              <p className="text-muted-foreground text-sm">Generate a tailored weekly schedule based on your goals.</p>
            </div>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>

          {showSettings ? (
            <form onSubmit={handleSavePref} className="space-y-4 mb-6 animate-in slide-in-from-top-2">
              <div className="bg-muted/30 p-4 rounded-2xl border border-border space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-wider text-foreground">Plan Settings</h3>
                
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Workout Days</label>
                  <div className="flex gap-2">
                    {DAYS.map((day, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                          preferences.daysOfWeek.includes(idx) 
                            ? "bg-primary text-primary-foreground border-primary" 
                            : "bg-background text-muted-foreground border-border"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Goals</label>
                    <input type="text" value={preferences.goals} onChange={e => setPreferences({...preferences, goals: e.target.value})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Session Duration (mins)</label>
                    <input type="number" value={preferences.sessionDurationMinutes} onChange={e => setPreferences({...preferences, sessionDurationMinutes: parseInt(e.target.value) || 45})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Equipment</label>
                    <input type="text" value={preferences.equipment} onChange={e => setPreferences({...preferences, equipment: e.target.value})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Limitations</label>
                    <input type="text" value={preferences.limitations} onChange={e => setPreferences({...preferences, limitations: e.target.value})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                  </div>
                </div>

                <button type="submit" disabled={updatePref.isPending}
                  className="w-full py-2 bg-foreground text-background font-bold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
                  {updatePref.isPending ? "Saving..." : "Save Preferences"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex gap-4 items-center bg-primary/5 border border-primary/20 p-4 rounded-2xl mb-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-sm">
                <p><strong>Goal:</strong> {preferences.goals || "None"}</p>
                <p><strong>Days:</strong> {preferences.daysOfWeek.map(d => DAYS[d]).join(", ") || "None"}</p>
                <p><strong>Time:</strong> {preferences.sessionDurationMinutes} mins</p>
              </div>
            </div>
          )}

          <button 
            onClick={handleGenerate}
            disabled={generatePlan.isPending || participantIds.length === 0}
            className="w-full py-4 bg-primary text-primary-foreground font-bold text-lg rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {generatePlan.isPending ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Plan...</>
            ) : (
              <><Sparkles className="w-5 h-5" /> Generate Next Week's Plan</>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center bg-card p-4 rounded-2xl border border-border sticky top-0 z-10 shadow-sm">
            <div>
              <h2 className="font-bold text-lg">Review Schedule</h2>
              <p className="text-xs text-muted-foreground">Adjust drafts as needed before saving.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPlanItems(null)} disabled={saving} className="px-4 py-2 border border-border rounded-lg text-sm font-bold hover:bg-muted">Cancel</button>
              <button onClick={handleSavePlan} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-md">
                <Check className="w-4 h-4" /> {saving ? "Saving..." : "Save Schedule"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {planItems.map((item, idx) => (
              <div key={idx} className="bg-card border border-border p-4 rounded-3xl shadow-sm">
                <h3 className="font-serif font-bold text-xl mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  {format(new Date(item.workoutDate), "EEEE, MMM d")}
                </h3>
                <EditableDraftWorkout 
                  draft={item.workout} 
                  onUpdate={(newDraft) => updateDraft(idx, newDraft)} 
                />
              </div>
            ))}
            {planItems.length === 0 && (
              <p className="text-center py-10 text-muted-foreground bg-card rounded-3xl border border-dashed border-border">
                No workouts scheduled for the selected days.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
