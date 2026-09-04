import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, User, Sparkles, Activity } from "lucide-react";
import {
  useGetWorkoutCoachConversation,
  useSendWorkoutCoachMessage,
  useCreateWorkout,
  useAddExercise,
  useGetWorkoutPreferences,
  getGetWorkoutCoachConversationQueryKey,
  getGetWorkoutsQueryKey,
  getGetWorkoutPreferencesQueryKey,
  WorkoutCoachMessage,
  WorkoutDraft
} from "@workspace/api-client-react";
import { EditableDraftWorkout } from "./EditableDraftWorkout";

export function WorkoutCoach({
  participantIds,
  onWorkoutLogged
}: {
  participantIds: string[];
  onWorkoutLogged: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: conversation, isLoading } = useGetWorkoutCoachConversation({
    query: { queryKey: getGetWorkoutCoachConversationQueryKey() }
  });
  const sendMessage = useSendWorkoutCoachMessage();
  const createWorkout = useCreateWorkout();
  const addExercise = useAddExercise();
  const { data: preferences } = useGetWorkoutPreferences({
    query: { queryKey: getGetWorkoutPreferencesQueryKey() }
  });

  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, draft, sendMessage.isPending]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending) return;

    const text = input;
    setInput("");
    
    sendMessage.mutate(
      { data: { content: text, participantIds } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetWorkoutCoachConversationQueryKey() });
          if (data.draft) {
            setDraft(data.draft);
          } else {
            setDraft(null);
          }
        },
        onError: () => {
          setInput(text);
        }
      }
    );
  };

  const handleLogDraft = async () => {
    if (!draft || participantIds.length === 0) return;
    setIsLogging(true);
    
    try {
      const newWorkout = await createWorkout.mutateAsync({
        data: {
          participantIds,
          title: draft.title,
          workoutDate: preferences?.currentLocalDate ?? new Date().toISOString().slice(0, 10),
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
      setDraft(null);
      onWorkoutLogged();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] max-h-[80vh] bg-card border-2 border-border rounded-3xl overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30 shrink-0 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-lg leading-tight">AI Workout Coach</h2>
          <p className="text-xs text-muted-foreground">Chat, ask for routines, or adjust plans</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
            <button
              onClick={handleLogDraft}
              disabled={isLogging}
              className="w-full mt-3 py-3 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLogging ? "Logging..." : <><Activity className="w-5 h-5" /> Log This Workout</>}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="w-full mt-2 py-2 font-bold rounded-xl border border-border text-muted-foreground hover:bg-muted transition-all"
            >
              Discard Draft
            </button>
          </div>
        )}
        
        <div ref={endRef} />
      </div>

      <div className="p-4 bg-background border-t border-border shrink-0">
        <form onSubmit={handleSend} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sendMessage.isPending}
            placeholder="E.g., I have dumbbells and 30 mins for chest & back..."
            className="w-full bg-muted/50 border border-border rounded-full pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="submit"
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
