import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { usePreferences } from "@/context/PreferencesContext";
import {
  useGetWorkouts,
  useGetFamilyMembers, useGetOverdueWorkoutSessions, useCompleteWorkoutSession, useUpdateWorkoutSessionStatus, useGetWorkoutPreferences, useUpdateWorkoutPreferences,
  getGetWorkoutsQueryKey,
  getGetFamilyMembersQueryKey, getGetOverdueWorkoutSessionsQueryKey, getGetWorkoutSessionsQueryKey, getGetWorkoutPreferencesQueryKey, WorkoutPreferencesInput, DraftExercise,
  WorkoutDraft
} from "@workspace/api-client-react";
import { Plus, History, Calendar, Sparkles, BookOpen, WandSparkles, Bell, Check } from "lucide-react";
import { WorkoutHistory } from "@/components/workouts/WorkoutHistory";
import { WorkoutWeeklyPlan } from "@/components/workouts/WorkoutWeeklyPlan";
import { WorkoutCoach } from "@/components/workouts/WorkoutCoach";
import { ExerciseLibrary } from "@/components/workouts/ExerciseLibrary";
import { CreateWorkoutModal } from "@/components/workouts/CreateWorkoutModal";

const WORKOUT_TABS = [
  { id: "coach", label: "Coach", Icon: Sparkles },
  { id: "plan", label: "Weekly Plan", Icon: Calendar },
  { id: "history", label: "History", Icon: History },
  { id: "library", label: "Library", Icon: BookOpen }
] as const;

type WorkoutTab = typeof WORKOUT_TABS[number]["id"];

function getSavedWorkoutTab(): WorkoutTab {
  if (typeof window === "undefined") return "coach";
  const savedTab = window.localStorage.getItem("homehub.workouts.activeTab");
  return WORKOUT_TABS.some(tab => tab.id === savedTab) ? savedTab as WorkoutTab : "coach";
}

export default function Workouts() {
  const queryClient = useQueryClient();
  const { data: allMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { activeMember } = useActiveMember();
  const { preferences } = usePreferences();
  const {
    data: workoutPreferences,
    isLoading: preferencesLoading,
    isSuccess: preferencesLoaded,
  } = useGetWorkoutPreferences({ query: { queryKey: getGetWorkoutPreferencesQueryKey() } });
  const updateWorkoutPreferences = useUpdateWorkoutPreferences();
  const { data: overdueSessions } = useGetOverdueWorkoutSessions({ query: { queryKey: getGetOverdueWorkoutSessionsQueryKey() } });
  const completeSession = useCompleteWorkoutSession();
  const updateSessionStatus = useUpdateWorkoutSessionStatus();
  const [overdueError, setOverdueError] = useState<string | null>(null);
  const isUpdatingOverdue = completeSession.isPending || updateSessionStatus.isPending;

  const invalidateWorkoutViews = () => {
    queryClient.invalidateQueries({ queryKey: getGetOverdueWorkoutSessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutSessionsQueryKey() });
  };
  // Only parents can use workouts
  const parents = allMembers?.filter(m => m.role === "parent") ?? [];

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<WorkoutTab>(getSavedWorkoutTab);
  useEffect(() => {
    window.localStorage.setItem("homehub.workouts.activeTab", activeTab);
  }, [activeTab]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [setupConfirmation, setSetupConfirmation] = useState<string | null>(null);
  const [pendingLibraryExercise, setPendingLibraryExercise] = useState<DraftExercise | null>(null);
  const [pendingLibraryRoutine, setPendingLibraryRoutine] = useState<WorkoutDraft | null>(null);
  const [setupValues, setSetupValues] = useState<WorkoutPreferencesInput>({ daysOfWeek: [1, 3, 6], goals: "", sessionDurationMinutes: 30, equipment: "", limitations: "", notes: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  useEffect(() => {
    if (!preferencesLoaded || !workoutPreferences) return;
    setSetupValues({ daysOfWeek: workoutPreferences.daysOfWeek, goals: workoutPreferences.goals, sessionDurationMinutes: workoutPreferences.sessionDurationMinutes, equipment: workoutPreferences.equipment, limitations: workoutPreferences.limitations, notes: workoutPreferences.notes, timezone: workoutPreferences.timezone });
    if (!preferencesLoading && (!localStorage.getItem("homehub.workouts.experience.v1") || !workoutPreferences.updatedAt)) setSetupOpen(true);
  }, [workoutPreferences, preferencesLoading, preferencesLoaded]);
  const saveSetup = () => updateWorkoutPreferences.mutate({ data: setupValues }, { onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: getGetWorkoutPreferencesQueryKey() });
    localStorage.setItem("homehub.workouts.experience.v1", "seen");
    setSetupOpen(false);
    setSetupConfirmation("Workout preferences saved. Your coach and weekly planner will use them.");
  } });

  // Initialize selected parents
  React.useEffect(() => {
    if (parents.length > 0 && selectedIds.length === 0) {
      const activeParent = preferences.tabs.workouts.defaultScope === "active"
        ? parents.find(parent => parent.id === activeMember?.id)
        : undefined;
      setSelectedIds(activeParent ? [activeParent.id] : parents.map(p => p.id));
    }
  }, [parents.length, preferences.tabs.workouts.defaultScope, activeMember?.id]);

  const bothSelected = selectedIds.length === parents.length && parents.length > 1;
  const singleSelected = selectedIds.length === 1 ? parents.find(p => p.id === selectedIds[0]) : null;

  // For history filtering, if we only select one, we can optionally pass `memberId` to query, 
  // but let's just fetch all and filter client side since workouts have multiple participants now
  const { data: allWorkouts, isLoading } = useGetWorkouts(
    {}, 
    { query: { queryKey: getGetWorkoutsQueryKey() } }
  );

  // Filter workouts by participantIds containing AT LEAST one of our selectedIds
  const workouts = allWorkouts?.filter(w => w.participantIds?.some(id => selectedIds.includes(id))) ?? [];

  const toggleMember = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  const defaultLogMember = singleSelected ?? null;

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl space-y-4 overflow-x-hidden animate-in fade-in duration-500 sm:space-y-5" data-testid="workouts-page">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Move together, <em className="text-primary font-medium">without the admin.</em>
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            A shared place for the workouts that fit your actual week.
          </p>
        </div>

        <div className="flex w-full items-center gap-3 md:w-auto">
          <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap"><button data-testid="button-review-workout-preferences" onClick={() => { setSetupStep(1); setSetupOpen(true); }} className="flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/10 md:px-3"><WandSparkles className="w-4 h-4" />Preferences</button><button data-testid="button-log-workout" onClick={() => setShowCreateModal(true)} className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-3 py-2.5 font-bold text-background shadow-md transition-colors hover:bg-foreground/90 md:px-5"><Plus className="w-5 h-5" />Log Workout</button></div>
        </div>
      </header>

      {setupConfirmation && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-green-900" role="status">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 text-sm font-medium">{setupConfirmation}</p>
          <button type="button" onClick={() => setSetupConfirmation(null)} className="shrink-0 text-xs font-bold text-green-800 hover:underline">Dismiss</button>
        </div>
      )}

      {parents.length > 0 && (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {parents.map(parent => {
            const active = selectedIds.includes(parent.id);
            return (
              <button
                key={parent.id}
                onClick={() => toggleMember(parent.id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border-2 ${
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
      {overdueSessions && overdueSessions.length > 0 && (
        <aside className="rounded-xl border border-amber-200/50 bg-amber-50/50 p-3" data-testid={`overdue-workout-${overdueSessions[0].id}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {overdueSessions.length} past workout{overdueSessions.length === 1 ? "" : "s"} needing review
                </p>
                <p className="text-xs text-muted-foreground truncate">Did you complete {overdueSessions[0].title}?</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <button data-testid="button-complete-overdue-workout" onClick={() => { setOverdueError(null); completeSession.mutate({ id: overdueSessions[0].id, data: {} }, { onSuccess: invalidateWorkoutViews, onError: () => setOverdueError("Failed to mark completed.") }) }} disabled={isUpdatingOverdue} className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-background disabled:opacity-50">Completed</button>
                <button data-testid="button-skip-overdue-workout" onClick={() => { setOverdueError(null); updateSessionStatus.mutate({ id: overdueSessions[0].id, data: { status: "skipped" } }, { onSuccess: invalidateWorkoutViews, onError: () => setOverdueError("Failed to update status.") }) }} disabled={isUpdatingOverdue} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold disabled:opacity-50">Not completed</button>
                <button data-testid="button-dismiss-overdue-workout" onClick={() => { setOverdueError(null); updateSessionStatus.mutate({ id: overdueSessions[0].id, data: { status: "dismissed" } }, { onSuccess: invalidateWorkoutViews, onError: () => setOverdueError("Failed to dismiss.") }) }} disabled={isUpdatingOverdue} className="rounded-lg px-3 py-1.5 text-xs font-bold text-muted-foreground disabled:opacity-50">Dismiss</button>
              </div>
              {overdueError && <p className="text-xs text-destructive font-bold" role="alert">{overdueError} <button onClick={() => setOverdueError(null)} className="underline ml-1">Clear</button></p>}
            </div>
          </div>
        </aside>
      )}

      {/* Tabs */}
      <div className="grid w-full grid-cols-4 gap-1 border-b border-border pb-3 sm:flex sm:gap-2 sm:overflow-x-auto sm:[&::-webkit-scrollbar]:hidden sm:[-ms-overflow-style:none] sm:[scrollbar-width:none]">
        {WORKOUT_TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-bold leading-tight transition-all sm:shrink-0 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                active 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <tab.Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="pt-2">
        {activeTab === "history" && (
          isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />)}
            </div>
          ) : (
            <WorkoutHistory 
              workouts={workouts} 
              bothSelected={bothSelected} 
              parents={parents} 
              onLogWorkout={() => setShowCreateModal(true)} 
            />
          )
        )}
        
        {activeTab === "plan" && (
          <WorkoutWeeklyPlan participantIds={selectedIds} onPlanSaved={() => undefined} onOpenCoach={() => setActiveTab("coach")} onLogWorkout={() => setShowCreateModal(true)} />
        )}
        
        {activeTab === "coach" && (
          <WorkoutCoach participantIds={selectedIds} onWorkoutLogged={() => setActiveTab("history")} onClose={() => setActiveTab("history")} libraryExercise={pendingLibraryExercise} onLibraryExerciseAdded={() => setPendingLibraryExercise(null)} libraryRoutine={pendingLibraryRoutine} onLibraryRoutineAdded={() => setPendingLibraryRoutine(null)} />
        )}
        
        {activeTab === "library" && (
          <ExerciseLibrary onUseExercise={exercise => { setPendingLibraryExercise(exercise); setActiveTab("coach"); }} onUseRoutine={routine => { setPendingLibraryRoutine(routine); setActiveTab("coach"); }} />
        )}
      </div>

      {showCreateModal && (
        <CreateWorkoutModal
          defaultMember={defaultLogMember}
          members={parents}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {setupOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label="Workout preferences setup"><section className="w-full max-w-xl max-h-[90vh] overflow-auto rounded-3xl bg-background p-5 shadow-2xl"><div className="flex justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.13em] font-bold text-primary">Your workout rhythm</p><h2 className="font-serif text-3xl font-bold">Make movement fit real life.</h2><p className="mt-1 text-sm text-muted-foreground">Step {setupStep} of 3</p></div><button data-testid="button-close-workout-setup" onClick={() => setSetupOpen(false)} className="h-9 rounded-lg border border-border px-3 text-sm font-bold">Close</button></div><div className="mt-5 grid gap-4">{setupStep === 1 && <><h3 className="font-serif text-xl font-bold">When do you want to move?</h3><div className="grid grid-cols-4 gap-2">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, index) => <button data-testid={`button-setup-day-${index}`} key={day} onClick={() => setSetupValues(current => ({ ...current, daysOfWeek: current.daysOfWeek.includes(index) ? current.daysOfWeek.filter(value => value !== index) : [...current.daysOfWeek, index] }))} className={`rounded-xl border p-3 text-sm font-bold ${setupValues.daysOfWeek.includes(index) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{day}</button>)}</div><label className="text-sm font-bold">How many sessions each week?<input data-testid="input-setup-frequency" type="number" min="1" max="7" value={setupValues.daysOfWeek.length} readOnly className="mt-1 block w-full rounded-lg border border-border bg-muted/30 p-2" /></label></>}{setupStep === 2 && <><h3 className="font-serif text-xl font-bold">What should the coach plan around?</h3><label className="text-sm font-bold">Session length<select data-testid="select-setup-duration" value={setupValues.sessionDurationMinutes} onChange={e => setSetupValues(current => ({ ...current, sessionDurationMinutes: Number(e.target.value) }))} className="mt-1 block w-full rounded-lg border border-border bg-background p-2">{[15,20,25,30,45,60].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label className="text-sm font-bold">Goals<input data-testid="input-setup-goals" value={setupValues.goals} onChange={e => setSetupValues(current => ({ ...current, goals: e.target.value }))} className="mt-1 block w-full rounded-lg border border-border p-2" placeholder="Strength together, mobility…" /></label><label className="text-sm font-bold">Equipment<input data-testid="input-setup-equipment" value={setupValues.equipment} onChange={e => setSetupValues(current => ({ ...current, equipment: e.target.value }))} className="mt-1 block w-full rounded-lg border border-border p-2" placeholder="Dumbbells, bands…" /></label></>}{setupStep === 3 && <><h3 className="font-serif text-xl font-bold">Anything to work around?</h3><label className="text-sm font-bold">Limitations or preferences<textarea data-testid="input-setup-limitations" value={setupValues.limitations} onChange={e => setSetupValues(current => ({ ...current, limitations: e.target.value }))} className="mt-1 block min-h-24 w-full rounded-lg border border-border p-2" placeholder="Knee-friendly options, injuries, dislikes…" /></label><label className="text-sm font-bold">Extra notes<textarea data-testid="input-setup-notes" value={setupValues.notes} onChange={e => setSetupValues(current => ({ ...current, notes: e.target.value }))} className="mt-1 block min-h-20 w-full rounded-lg border border-border p-2" /></label></>}</div><div className="mt-6 flex justify-between gap-3"><button data-testid="button-skip-workout-setup" onClick={() => { localStorage.setItem("homehub.workouts.experience.v1", "seen"); setSetupOpen(false); setSetupConfirmation("Setup skipped for now. Return to Preferences whenever you are ready."); }} className="rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground">Skip for now</button><div className="flex gap-2">{setupStep > 1 && <button onClick={() => setSetupStep(step => step - 1)} className="rounded-lg border border-border px-3 py-2 text-sm font-bold">Back</button>}{setupStep < 3 ? <button data-testid="button-next-workout-setup" onClick={() => setSetupStep(step => step + 1)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background">Next</button> : <button data-testid="button-save-workout-setup" onClick={saveSetup} disabled={updateWorkoutPreferences.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{updateWorkoutPreferences.isPending ? "Saving…" : "Save preferences"}</button>}</div></div></section></div>}
    </main>
  );
}
