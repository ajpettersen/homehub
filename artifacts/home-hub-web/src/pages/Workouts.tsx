import React, { useState } from "react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { usePreferences } from "@/context/PreferencesContext";
import {
  useGetWorkouts,
  useGetFamilyMembers,
  getGetWorkoutsQueryKey,
  getGetFamilyMembersQueryKey
} from "@workspace/api-client-react";
import { Plus, History, Calendar, Sparkles, BookOpen } from "lucide-react";
import { WorkoutHistory } from "@/components/workouts/WorkoutHistory";
import { WorkoutWeeklyPlan } from "@/components/workouts/WorkoutWeeklyPlan";
import { WorkoutCoach } from "@/components/workouts/WorkoutCoach";
import { ExerciseLibrary } from "@/components/workouts/ExerciseLibrary";
import { CreateWorkoutModal } from "@/components/workouts/CreateWorkoutModal";

export default function Workouts() {
  const { data: allMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { activeMember } = useActiveMember();
  const { preferences } = usePreferences();

  // Only parents can use workouts
  const parents = allMembers?.filter(m => m.role === "parent") ?? [];

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"history" | "plan" | "coach" | "library">("history");
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  const TABS = [
    { id: "history", label: "History", Icon: History },
    { id: "plan", label: "Weekly Plan", Icon: Calendar },
    { id: "coach", label: "AI Coach", Icon: Sparkles },
    { id: "library", label: "Exercise Library", Icon: BookOpen }
  ] as const;

  return (
    <div className="pb-12 animate-in fade-in duration-500 max-w-4xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight">
            Training
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            {bothSelected ? "Showing workouts for everyone" : singleSelected ? `Showing ${singleSelected.name}'s workouts` : "Select who to view"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-bold hover:bg-foreground/90 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Log Workout
          </button>
        </div>
      </header>

      {parents.length > 0 && (
        <div className="flex gap-2">
          {parents.map(parent => {
            const active = selectedIds.includes(parent.id);
            return (
              <button
                key={parent.id}
                onClick={() => toggleMember(parent.id)}
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

      {/* Tabs */}
      <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center justify-center md:justify-start gap-1.5 md:gap-2 px-2 md:px-4 py-2.5 md:py-2 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
                active 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <tab.Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
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
          <WorkoutWeeklyPlan participantIds={selectedIds} onPlanSaved={() => setActiveTab("history")} />
        )}
        
        {activeTab === "coach" && (
          <WorkoutCoach participantIds={selectedIds} onWorkoutLogged={() => setActiveTab("history")} />
        )}
        
        {activeTab === "library" && (
          <ExerciseLibrary />
        )}
      </div>

      {showCreateModal && (
        <CreateWorkoutModal
          defaultMember={defaultLogMember}
          members={parents}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
