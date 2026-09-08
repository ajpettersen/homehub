import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Settings, Sparkles, Check, RefreshCw, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { format, addDays, addWeeks, startOfWeek } from "date-fns";
import {
  useGetWorkoutPreferences,
  useUpdateWorkoutPreferences,
  useGenerateWorkoutWeekPlan,
  useSaveWorkoutWeekPlan,
  useGetWorkoutSessions,
  useCompleteWorkoutSession,
  useUpdateWorkoutSessionStatus,
  useRescheduleWorkoutSession,
  useDraftWorkout,
  useScheduleWorkoutSession,
  useGetWorkouts,
  getGetWorkoutPreferencesQueryKey,
  getGetWorkoutsQueryKey,
  getGetWorkoutSessionsQueryKey,
  getGetOverdueWorkoutSessionsQueryKey,
  WorkoutPreferencesInput,
  WorkoutWeekPlanItem,
  WorkoutDraft
} from "@workspace/api-client-react";
import { EditableDraftWorkout } from "./EditableDraftWorkout";
import { useGetWorkout, getGetWorkoutQueryKey } from "@workspace/api-client-react";
import { formatDateOnly } from "../../lib/dateOnly";

function SwapHistoryButton({ workout, onSelect }: { workout: any; onSelect: (draft: WorkoutDraft) => void }) {
  const [isFetching, setIsFetching] = useState(false);
  const { data: detail, isFetching: isLoading } = useGetWorkout(workout.id, {
    query: {
      enabled: isFetching,
      queryKey: getGetWorkoutQueryKey(workout.id)
    }
  });

  useEffect(() => {
    if (isFetching && detail) {
      setIsFetching(false);
      onSelect({
        intent: "plan",
        title: detail.title,
        durationMinutes: detail.durationMinutes || 30,
        notes: detail.notes || null,
        rationale: "Reused from your history.",
        exercises: detail.exercises.map((ex: any) => ({
          name: ex.name,
          muscleGroups: ex.muscleGroups,
          sets: ex.sets || null,
          reps: ex.reps || null,
          weightLbs: ex.weightLbs || null,
          durationSeconds: ex.durationSeconds || null,
          notes: ex.notes || null
        }))
      });
    }
  }, [isFetching, detail, onSelect]);

  return (
    <button
      type="button"
      disabled={isLoading || isFetching}
      onClick={() => setIsFetching(true)}
      className="flex justify-between items-center text-left p-3 rounded-xl border border-border hover:border-primary/50 transition-colors group bg-background disabled:opacity-50"
    >
      <div>
        <strong className="font-bold text-sm block">{workout.title}</strong>
        <span className="text-xs text-muted-foreground">{workout.exerciseCount} exercises</span>
      </div>
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Check className="w-4 h-4" />
      </div>
    </button>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

import { STARTER_ROUTINES } from "./starterRoutines";

const currentMonday = () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

function isMondayWeekStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && format(date, "yyyy-MM-dd") === value && date.getDay() === 1;
}

export function WorkoutWeeklyPlan({ participantIds, onPlanSaved, onOpenCoach, onLogWorkout }: { participantIds: string[], onPlanSaved: () => void, onOpenCoach?: () => void, onLogWorkout?: () => void }) {
  const queryClient = useQueryClient();
  const { data: prefData, isLoading: prefLoading } = useGetWorkoutPreferences({
    query: { queryKey: getGetWorkoutPreferencesQueryKey() }
  });
  
  const updatePref = useUpdateWorkoutPreferences();
  const generatePlan = useGenerateWorkoutWeekPlan();
  const savePlan = useSaveWorkoutWeekPlan();
  const completeSession = useCompleteWorkoutSession();
  const updateSessionStatus = useUpdateWorkoutSessionStatus();
  const rescheduleSession = useRescheduleWorkoutSession();
  const draftWorkout = useDraftWorkout();
  const scheduleSession = useScheduleWorkoutSession();
  const { data: allWorkouts } = useGetWorkouts({}, { query: { queryKey: getGetWorkoutsQueryKey() } });

  const [planMode, setPlanMode] = useState<"daily" | "weekly">("weekly");
  const [dailyDraft, setDailyDraft] = useState<WorkoutDraft | null>(null);
  const [schedulingDaily, setSchedulingDaily] = useState(false);
  const [swapTargetIdx, setSwapTargetIdx] = useState<number | null>(null);

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
  const [weekStart, setWeekStart] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (prefData) {
      if (!weekStart) setWeekStart(isMondayWeekStart(prefData.currentWeekStart) ? prefData.currentWeekStart : currentMonday());
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
  const validWeekStart = isMondayWeekStart(weekStart) ? weekStart : currentMonday();
  const sessionsQuery = useGetWorkoutSessions(
    { weekStart: validWeekStart },
    { query: { queryKey: getGetWorkoutSessionsQueryKey({ weekStart: validWeekStart }) } }
  );
  const invalidateSessions = () => {
    queryClient.invalidateQueries({ queryKey: getGetWorkoutSessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutSessionsQueryKey({ weekStart: validWeekStart }), exact: true });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOverdueWorkoutSessionsQueryKey() });
    if (selectedSessionId) {
      queryClient.invalidateQueries({ queryKey: getGetWorkoutQueryKey(selectedSessionId) });
    }
  };
  const selectedSession = sessionsQuery.data?.find(session => session.id === selectedSessionId);
  const selectedSessionDetailQuery = useGetWorkout(selectedSessionId ?? "", {
    query: {
      enabled: Boolean(selectedSessionId),
      queryKey: getGetWorkoutQueryKey(selectedSessionId ?? ""),
    },
  });
  const resolve = (id: string, action: "complete" | "skipped" | "cancelled" | "dismissed") => {
    if (action === "complete") completeSession.mutate({ id, data: {} }, { onSuccess: invalidateSessions });
    else updateSessionStatus.mutate({ id, data: { status: action } }, { onSuccess: invalidateSessions });
  };
  const reschedule = (id: string) => {
    const scheduledDate = window.prompt("Move this session to (YYYY-MM-DD):");
    if (!scheduledDate) return;
    rescheduleSession.mutate({ id, data: { scheduledDate, scheduledTimezone: prefData?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone } }, { onSuccess: invalidateSessions });
  };

  const handleSavePref = async (e: React.FormEvent) => {
    e.preventDefault();
    await updatePref.mutateAsync({ data: preferences });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutPreferencesQueryKey() });
    setShowSettings(false);
    setActionMessage("Preferences saved. You can generate the week now.");
  };

  const handleGenerate = async () => {
    if (participantIds.length === 0) {
      setActionMessage("Select at least one adult above before generating a plan.");
      return;
    }
    if (preferences.daysOfWeek.length === 0) {
      setShowSettings(true);
      setActionMessage("Choose at least one workout day, then save your preferences.");
      return;
    }
    setActionMessage(null);
    try {
      const data = await generatePlan.mutateAsync({
        data: {
          weekStart: validWeekStart,
          participantIds,
          preferences
        }
      });
      setPlanItems(data.items);
    } catch (e) {
      console.error(e);
      setActionMessage("The plan could not be generated. Please try again.");
    }
  };

  const handleSavePlan = async () => {
    if (!planItems) return;
    setSaving(true);
    try {
      await savePlan.mutateAsync({
        data: {
          items: planItems,
          weekStart: validWeekStart,
          timezone: preferences.timezone
        }
      });
      invalidateSessions();
      setPlanItems(null);
      setActionMessage("Your workout schedule has been saved.");
      onPlanSaved();
    } catch (e) {
      console.error(e);
      setActionMessage("The schedule could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDaily = async () => {
    if (participantIds.length === 0) {
      setActionMessage("Select at least one adult above before generating a plan.");
      return;
    }
    setActionMessage(null);
    try {
      const draft = await draftWorkout.mutateAsync({
        data: {
          prompt: `Generate a workout for today. Goals: ${preferences.goals}. Equipment: ${preferences.equipment}. Limitations: ${preferences.limitations}. Duration: ${preferences.sessionDurationMinutes} mins.`,
          participantIds,
        }
      });
      setDailyDraft({ ...draft, intent: "plan" });
    } catch (e) {
      console.error(e);
      setActionMessage("The daily plan could not be generated. Please try again.");
    }
  };

  const handleScheduleDaily = async () => {
    if (!dailyDraft || participantIds.length === 0) return;
    setSchedulingDaily(true);
    try {
      await scheduleSession.mutateAsync({
        data: {
          participantIds,
          title: dailyDraft.title,
          scheduledDate: prefData?.currentLocalDate ?? format(new Date(), "yyyy-MM-dd"),
          scheduledTimezone: preferences.timezone,
          durationMinutes: dailyDraft.durationMinutes,
          notes: dailyDraft.notes || null,
          exercises: dailyDraft.exercises.filter((ex: any) => ex.name).map((ex: any) => ({
            name: ex.name,
            muscleGroups: ex.muscleGroups,
            sets: ex.sets,
            reps: ex.reps,
            weightLbs: ex.weightLbs,
            durationSeconds: ex.durationSeconds,
            notes: ex.notes
          }))
        }
      });
      invalidateSessions();
      setDailyDraft(null);
      setActionMessage("Today's workout has been scheduled.");
      onPlanSaved();
    } catch (e) {
      console.error(e);
      setActionMessage("The workout could not be scheduled. Please try again.");
    } finally {
      setSchedulingDaily(false);
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

  const handleSwapSelect = (draft: WorkoutDraft) => {
    if (swapTargetIdx !== null) {
      updateDraft(swapTargetIdx, draft);
      setSwapTargetIdx(null);
    }
  };

  if (prefLoading) {
    return <div className="animate-pulse h-64 bg-muted rounded-3xl" />;
  }

  return (
    <div className="space-y-6">
      <section className="bg-card border border-border rounded-3xl p-4 sm:p-6 shadow-sm" data-testid="weekly-plan-calendar">
        <div className="flex flex-col sm:flex-row justify-between gap-4 sm:items-start">
          <div>
            <p className="text-[10px] uppercase tracking-[.13em] font-bold text-primary">Shared schedule</p>
            <h2 className="font-serif font-bold text-2xl">Make room for moving.</h2>
            <p className="text-sm text-muted-foreground">Planned sessions and completed history, side by side.</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex bg-muted/50 p-1 rounded-xl self-end">
              <button type="button" onClick={() => setPlanMode("weekly")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${planMode === "weekly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Weekly</button>
              <button type="button" onClick={() => setPlanMode("daily")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${planMode === "daily" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Daily</button>
            </div>
            <div className="flex items-center gap-2 self-end">
              <button data-testid="button-previous-workout-week" onClick={() => setWeekStart(format(addWeeks(new Date(`${validWeekStart}T12:00:00`), -1), "yyyy-MM-dd"))} className="p-2 border border-border rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
              <strong className="text-xs min-w-36 text-center">{`${format(new Date(`${validWeekStart}T12:00:00`), "MMM d")} – ${format(addDays(new Date(`${validWeekStart}T12:00:00`), 6), "MMM d")}`}</strong>
              <button data-testid="button-next-workout-week" onClick={() => setWeekStart(format(addWeeks(new Date(`${validWeekStart}T12:00:00`), 1), "yyyy-MM-dd"))} className="p-2 border border-border rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-2 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {Array.from({ length: 7 }, (_, day) => {
            const date = format(addDays(new Date(`${validWeekStart}T12:00:00`), day), "yyyy-MM-dd");
            const daySessions = sessionsQuery.data?.filter(item => (item.scheduledDate || item.workoutDate) === date) ?? [];
            return <div data-testid={`plan-day-${date}`} key={date} className="snap-start shrink-0 w-32 min-h-28 p-3 text-left rounded-xl border border-border bg-background"><span className="block text-[10px] uppercase text-muted-foreground">{format(new Date(`${date}T12:00:00`), "EEE")}</span><strong className="font-serif text-xl">{format(new Date(`${date}T12:00:00`), "d")}</strong>{daySessions.length ? <div className="mt-2 space-y-1">{daySessions.map(session => <button data-testid={`button-plan-session-${session.id}`} key={session.id} onClick={() => setSelectedSessionId(session.id)} className={`block w-full rounded p-1 text-left text-[10px] font-bold ${selectedSessionId === session.id ? "bg-primary text-primary-foreground" : session.sessionStatus === "completed" ? "bg-green-100 text-green-800" : session.sessionStatus === "scheduled" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}><span className="block uppercase">{session.sessionStatus === "missed" ? "Needs confirmation" : session.sessionStatus}</span><span className="line-clamp-2">{session.title}</span></button>)}</div> : <span className="mt-4 block text-[10px] text-muted-foreground">Rest / open</span>}</div>;
          })}
        </div>
        {sessionsQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading this week…</p>
        ) : selectedSession ? (
          <div className="mt-3 rounded-xl bg-muted/50 p-4" data-testid="workout-session-detail">
            <div className="flex justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase text-primary">{selectedSession.sessionStatus}</span>
                <h3 className="font-serif text-xl font-bold">{selectedSession.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedSession.participants.map(person => person.name).join(" + ")} · {selectedSession.durationMinutes ?? "—"} min
                </p>
              </div>
              <Clock3 className="h-5 w-5 shrink-0 text-muted-foreground" />
            </div>

            {selectedSessionDetailQuery.isLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading workout details…</p>
            ) : selectedSessionDetailQuery.isError ? (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">The workout details could not be loaded.</p>
                <button
                  type="button"
                  onClick={() => selectedSessionDetailQuery.refetch()}
                  className="mt-2 text-xs font-bold text-primary hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : selectedSessionDetailQuery.data ? (
              <div className="mt-4 space-y-3">
                {selectedSessionDetailQuery.data.notes && (
                  <p className="text-sm text-muted-foreground">{selectedSessionDetailQuery.data.notes}</p>
                )}
                {selectedSessionDetailQuery.data.exercises.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Exercises</h4>
                    {selectedSessionDetailQuery.data.exercises.map((exercise, index) => (
                      <div key={exercise.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground">{exercise.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {[
                                exercise.sets && `${exercise.sets} sets`,
                                exercise.reps && `${exercise.reps} reps`,
                                exercise.weightLbs !== null && exercise.weightLbs !== undefined && `${exercise.weightLbs} lb`,
                                exercise.durationSeconds && `${Math.round(exercise.durationSeconds / 60)} min`,
                              ].filter(Boolean).join(" · ") || "Details not specified"}
                            </p>
                            {exercise.notes && <p className="mt-1 text-xs italic text-muted-foreground">{exercise.notes}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                    No exercises were saved with this workout.
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedSession.sessionStatus === "scheduled" && (
                <>
                  <button type="button" data-testid="button-complete-session" onClick={() => resolve(selectedSession.id, "complete")} className="rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background">Complete</button>
                  <button type="button" data-testid="button-reschedule-session" onClick={() => reschedule(selectedSession.id)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold">Reschedule</button>
                  <button type="button" data-testid="button-skip-session" onClick={() => resolve(selectedSession.id, "skipped")} className="rounded-lg border border-border px-3 py-2 text-xs font-bold">Skip</button>
                </>
              )}
              {selectedSession.sessionStatus === "missed" && (
                <>
                  <button type="button" onClick={() => resolve(selectedSession.id, "complete")} className="rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background">Yes, completed it</button>
                  <button type="button" onClick={() => reschedule(selectedSession.id)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold">Reschedule</button>
                  <button type="button" onClick={() => resolve(selectedSession.id, "dismissed")} className="rounded-lg border border-border px-3 py-2 text-xs font-bold">Dismiss</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Select a workout to see its exercises and details.</p>
        )}
        {!sessionsQuery.isLoading && sessionsQuery.data?.length === 0 && !planItems && !dailyDraft && (
          <div className="mt-4 flex flex-col items-center justify-center p-5 text-center border border-dashed border-border rounded-2xl bg-muted/20">
            <Sparkles className="w-6 h-6 text-muted-foreground mb-2" />
            <h3 className="font-bold text-foreground text-sm">Your week is completely open</h3>
            <p className="text-xs text-muted-foreground max-w-md mt-1 mb-4">
              Generate a weekly plan below based on your preferences, ask the Coach for a workout, or log one manually.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {planMode === "weekly" ? (
                <button onClick={() => {
                  if (preferences.daysOfWeek.length === 0) setShowSettings(true);
                  else handleGenerate();
                }} className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90">
                  {preferences.daysOfWeek.length === 0 ? "Set Preferences & Plan" : "Generate Weekly Plan"}
                </button>
              ) : (
                <button onClick={handleGenerateDaily} className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90">
                  Generate Daily Plan
                </button>
              )}
              {onOpenCoach && (
                <button onClick={onOpenCoach} className="px-4 py-2 bg-muted text-foreground text-xs font-bold rounded-xl hover:bg-muted/80">
                  Ask Coach
                </button>
              )}
              {onLogWorkout && (
                <button onClick={onLogWorkout} className="px-4 py-2 bg-card border border-border text-foreground text-xs font-bold rounded-xl hover:bg-muted/50">
                  Log Workout
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {planMode === "daily" && !dailyDraft && (
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="font-serif font-bold text-2xl mb-1">Daily AI Planner</h2>
              <p className="text-muted-foreground text-sm">Generate a tailored workout for today.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerateDaily}
            disabled={draftWorkout.isPending}
            className="w-full py-4 bg-primary text-primary-foreground font-bold text-lg rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {draftWorkout.isPending ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Plan...</>
            ) : (
              <><Sparkles className="w-5 h-5" /> Generate Today's Plan</>
            )}
          </button>
          {actionMessage && <p className="mt-3 text-center text-sm font-medium text-muted-foreground" role="status">{actionMessage}</p>}
        </div>
      )}

      {planMode === "daily" && dailyDraft && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col justify-between gap-3 bg-card p-4 rounded-2xl border border-border sticky top-0 z-10 shadow-sm sm:flex-row sm:items-center">
            <div>
              <h2 className="font-bold text-lg">Review Schedule</h2>
              <p className="text-xs text-muted-foreground">Adjust your workout before scheduling.</p>
            </div>
            <div className="flex gap-2 sm:justify-end">
              <button type="button" onClick={() => setDailyDraft(null)} disabled={schedulingDaily} className="px-4 py-2 border border-border rounded-lg text-sm font-bold hover:bg-muted">Cancel</button>
              <button type="button" onClick={handleScheduleDaily} disabled={schedulingDaily} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-md">
                <Check className="w-4 h-4" /> {schedulingDaily ? "Scheduling..." : "Add to today's plan"}
              </button>
            </div>
          </div>
          <div className="bg-card border border-border p-4 rounded-3xl shadow-sm">
            <h3 className="font-serif font-bold text-xl mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Today
            </h3>
            <EditableDraftWorkout draft={dailyDraft} onUpdate={setDailyDraft} />
          </div>
          {actionMessage && <p className="mt-3 text-center text-sm font-medium text-muted-foreground" role="status">{actionMessage}</p>}
        </div>
      )}

      {planMode === "weekly" && !planItems ? (
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
                   <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {DAYS.map((day, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all border ${
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
                    <select data-testid="select-workout-duration" value={preferences.sessionDurationMinutes} onChange={e => setPreferences({...preferences, sessionDurationMinutes: parseInt(e.target.value)})}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary">{[15,20,25,30,45,60].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select>
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
            disabled={generatePlan.isPending}
            className="w-full py-4 bg-primary text-primary-foreground font-bold text-lg rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {generatePlan.isPending ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Plan...</>
            ) : (
              <><Sparkles className="w-5 h-5" /> Generate Weekly Plan</>
            )}
          </button>
          {actionMessage && <p className="mt-3 text-center text-sm font-medium text-muted-foreground" role="status">{actionMessage}</p>}
        </div>
      ) : planMode === "weekly" && planItems ? (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col justify-between gap-3 bg-card p-4 rounded-2xl border border-border sticky top-0 z-10 shadow-sm sm:flex-row sm:items-center">
            <div>
              <h2 className="font-bold text-lg">Review Schedule</h2>
              <p className="text-xs text-muted-foreground">Adjust drafts as needed before saving.</p>
            </div>
            <div className="flex gap-2 sm:justify-end">
              <button onClick={() => setPlanItems(null)} disabled={saving} className="px-4 py-2 border border-border rounded-lg text-sm font-bold hover:bg-muted">Cancel</button>
              <button onClick={handleSavePlan} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-md">
                <Check className="w-4 h-4" /> {saving ? "Saving..." : "Save Schedule"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {planItems.map((item, idx) => (
              <div key={idx} className="bg-card border border-border p-4 rounded-3xl shadow-sm relative">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-serif font-bold text-xl flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    {formatDateOnly(item.workoutDate, "EEEE, MMM d")}
                  </h3>
                  <button type="button" onClick={() => setSwapTargetIdx(idx)} className="px-3 py-1.5 border border-border text-xs font-bold rounded-lg hover:bg-muted text-muted-foreground transition-colors">Swap workout</button>
                </div>
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
      ) : null}

      {swapTargetIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in" onClick={() => setSwapTargetIdx(null)}>
          <div className="bg-card w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-border shadow-2xl p-6 relative" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif font-bold text-2xl mb-4">Choose a workout</h3>
            <p className="text-sm text-muted-foreground mb-6">Select a starter routine or completed workout from your history to replace this day's plan.</p>

            <div className="space-y-6">
              <div>
                <h4 className="font-bold text-sm text-foreground mb-3 uppercase tracking-wider">Starter Routines</h4>
                <div className="grid gap-3">
                  {STARTER_ROUTINES.map((routine, idx) => (
                    <button key={`starter-${idx}`} onClick={() => handleSwapSelect(routine)} className="flex justify-between items-center text-left p-3 rounded-xl border border-border hover:border-primary/50 transition-colors group bg-background">
                      <div>
                        <strong className="font-bold text-sm block">{routine.title}</strong>
                        <span className="text-xs text-muted-foreground">{routine.exercises.length} exercises · {routine.durationMinutes}m</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Check className="w-4 h-4" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {allWorkouts && allWorkouts.filter(w => w.sessionStatus === "completed").length > 0 && (
                <div>
                  <h4 className="font-bold text-sm text-foreground mb-3 uppercase tracking-wider">From your history</h4>
                  <div className="grid gap-3">
                    {allWorkouts.filter(w => w.sessionStatus === "completed").map((w) => (
                      <SwapHistoryButton key={`history-${w.id}`} workout={w} onSelect={handleSwapSelect} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button type="button" onClick={() => setSwapTargetIdx(null)} className="absolute top-4 right-4 p-2 text-muted-foreground hover:bg-muted rounded-full">
              <span className="sr-only">Close</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
