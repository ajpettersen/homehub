import React, { useState, useEffect, useRef } from "react";
import { format, startOfWeek } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Send, User, Sparkles, Activity, CalendarDays, X } from "lucide-react";
import {
  useGetWorkoutCoachConversation,
  useSendWorkoutCoachMessage,
  useCreateWorkout,
  useAddExercise,
  useScheduleWorkoutSession,
  useGetWorkoutPreferences,
  getGetWorkoutCoachConversationQueryKey,
  getGetWorkoutsQueryKey,
  getGetWorkoutSessionsQueryKey,
  getGetOverdueWorkoutSessionsQueryKey,
  getGetWorkoutPreferencesQueryKey,
  WorkoutCoachMessage,
  WorkoutDraft, DraftExercise
} from "@workspace/api-client-react";
import { EditableDraftWorkout } from "./EditableDraftWorkout";

export function WorkoutCoach({
  participantIds,
  onWorkoutLogged,
  onClose,
  libraryExercise,
  onLibraryExerciseAdded
}: {
  participantIds: string[];
  onWorkoutLogged: () => void;
  onClose: () => void;
  libraryExercise?: DraftExercise | null;
  onLibraryExerciseAdded?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: conversation, isLoading } = useGetWorkoutCoachConversation({
    query: { queryKey: getGetWorkoutCoachConversationQueryKey() }
  });
  const sendMessage = useSendWorkoutCoachMessage();
  const createWorkout = useCreateWorkout();
  const addExercise = useAddExercise();
  const scheduleSession = useScheduleWorkoutSession();
  const { data: preferences } = useGetWorkoutPreferences({
    query: { queryKey: getGetWorkoutPreferencesQueryKey() }
  });

  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);
  const [workoutDate, setWorkoutDate] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messages = messagesRef.current;
    if (!messages) return;
    messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages, draft, sendMessage.isPending]);
  useEffect(() => {
    if (preferences?.currentLocalDate && !workoutDate) setWorkoutDate(preferences.currentLocalDate);
  }, [preferences?.currentLocalDate, workoutDate]);
  useEffect(() => {
    if (!libraryExercise) return;
    setDraft(current => current ? { ...current, exercises: [...current.exercises, libraryExercise] } : {
      title: "Workout draft", durationMinutes: preferences?.sessionDurationMinutes ?? 30, notes: null,
      rationale: "Started from a movement in your completed history.", exercises: [libraryExercise]
    });
    onLibraryExerciseAdded?.();
  }, [libraryExercise, onLibraryExerciseAdded, preferences?.sessionDurationMinutes]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending) return;

    const text = input;
    setInput("");
    setOptimisticMessage(text);
    
    sendMessage.mutate(
      { data: { content: text, participantIds } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetWorkoutCoachConversationQueryKey() });
          setOptimisticMessage(null);
          if (data.draft) {
            setDraft(data.draft);
          } else {
            setDraft(null);
          }
        },
        onError: () => {
          setInput(text);
          setOptimisticMessage(null);
        }
      }
    );
  };

  const handleLogDraft = async () => {
    if (!draft || participantIds.length === 0) return;
    setIsLogging(true);
    
    try {
      const isFuture = workoutDate > (preferences?.currentLocalDate ?? "");
      if (isFuture) {
        await scheduleSession.mutateAsync({ data: {
          participantIds,
          title: draft.title,
          scheduledDate: workoutDate,
          scheduledTimezone: preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          durationMinutes: draft.durationMinutes,
          notes: draft.notes || null,
          exercises: draft.exercises.filter(ex => ex.name).map(ex => ({
            name: ex.name, muscleGroups: ex.muscleGroups, sets: ex.sets, reps: ex.reps,
            weightLbs: ex.weightLbs, durationSeconds: ex.durationSeconds, notes: ex.notes
          }))
        }});
      } else {
        const newWorkout = await createWorkout.mutateAsync({ data: {
          participantIds, title: draft.title, workoutDate,
          durationMinutes: draft.durationMinutes, notes: draft.notes || null,
        }});
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
      }

      queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetWorkoutSessionsQueryKey() });
      if (/^\d{4}-\d{2}-\d{2}$/.test(workoutDate)) {
        queryClient.invalidateQueries({ queryKey: getGetWorkoutSessionsQueryKey({ weekStart: format(startOfWeek(new Date(`${workoutDate}T12:00:00`), { weekStartsOn: 1 }), "yyyy-MM-dd") }), exact: true });
      }
      queryClient.invalidateQueries({ queryKey: getGetOverdueWorkoutSessionsQueryKey() });
      setDraft(null);
      onWorkoutLogged();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border-2 border-border bg-card sm:h-[600px] sm:max-h-[80vh]">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/30 p-3 sm:p-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-lg leading-tight">AI Workout Coach</h2>
          <p className="text-xs text-muted-foreground">Chat, ask for routines, or adjust plans</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="button-close-workout-coach"
          className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
          Done
        </button>
      </div>

      <div ref={messagesRef} className="min-h-[14rem] max-h-[42dvh] flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:max-h-none sm:p-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-full text-muted-foreground">
            Loading history...
          </div>
        ) : conversation?.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50">
            <Sparkles className="w-12 h-12" />
            <p className="font-medium text-sm">Say hi! Try asking for a quick 20m core workout.</p>
          </div>
        ) : (
          conversation?.messages.map((msg: WorkoutCoachMessage) => (
            <div key={msg.id} className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
              }`}>
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              </div>
              <div className={`p-3 rounded-2xl text-sm ${
                msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"
              }`}>
                {msg.content}
                {msg.draft && (
                  <div className="mt-3 rounded-xl border border-primary/20 bg-background/70 p-3 text-foreground">
                    <p className="font-bold">{msg.draft.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {msg.draft.durationMinutes} min · {msg.draft.exercises.length} exercises
                    </p>
                    <button
                      type="button"
                      onClick={() => setDraft(msg.draft)}
                      className="mt-2 text-xs font-bold text-primary hover:underline"
                    >
                      Review and edit this saved draft
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {optimisticMessage && (
          <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse" data-testid="status-pending-coach-message">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"><User className="w-4 h-4" /></div>
            <div className="p-3 rounded-2xl text-sm bg-primary text-primary-foreground rounded-tr-sm">{optimisticMessage}</div>
          </div>
        )}

        {sendMessage.isPending && (
          <div className="flex gap-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div className="p-3 rounded-2xl text-sm bg-muted rounded-tl-sm animate-pulse">
              Thinking...
            </div>
          </div>
        )}

        {draft && (
          <div className="max-w-[100%] pt-2 animate-in slide-in-from-bottom-2">
            <EditableDraftWorkout draft={draft} onUpdate={setDraft} />
            <label className="mt-3 block text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Workout date
              <input data-testid="input-draft-workout-date" type="date" value={workoutDate} onChange={e => setWorkoutDate(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
            </label>
            <button
              onClick={handleLogDraft}
              disabled={isLogging}
              className="w-full mt-3 py-3 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLogging ? "Saving..." : workoutDate > (preferences?.currentLocalDate ?? "") ? <><CalendarDays className="w-5 h-5" /> Add to weekly schedule</> : <><Activity className="w-5 h-5" /> Log completed workout</>}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="w-full mt-2 py-2 font-bold rounded-xl border border-border text-muted-foreground hover:bg-muted transition-all"
            >
              Discard Draft
            </button>
          </div>
        )}
        
      </div>

      <div className="shrink-0 border-t border-border bg-background p-3 sm:p-4">
        <form onSubmit={handleSend} className="relative">
          <input
            type="text"
            value={input}
            data-testid="input-coach-message"
            onChange={(e) => setInput(e.target.value)}
            disabled={sendMessage.isPending}
            placeholder="E.g., I have dumbbells and 30 mins for chest & back..."
            className="w-full bg-muted/50 border border-border rounded-full pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="submit"
            data-testid="button-send-coach-message"
            disabled={sendMessage.isPending || !input.trim()}
            className="absolute right-1.5 top-1.5 bottom-1.5 w-10 flex items-center justify-center bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
