import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCompleteWorkoutSession, useGetDashboard, useGetOverdueWorkoutSessions, useUpdateWorkoutSessionStatus,
  getGetDashboardQueryKey, getGetOverdueWorkoutSessionsQueryKey, getGetWorkoutsQueryKey, getGetWorkoutSessionsQueryKey,
  useListAiMemories, getListAiMemoriesQueryKey, useDeleteAiMemory,
  getGetChoresQueryKey, getGetMealPlansQueryKey, getGetGroceryListsQueryKey,
  getGetMaintenanceTasksQueryKey, useGetMe, getGetMeQueryKey, type HomeHubWebTab
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Clock, Utensils, AlertTriangle, CheckSquare,
  Sparkles, Send, Paperclip, X, Loader2, Brain, ChevronDown, ChevronUp, Bell, Check, MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { formatDateOnly } from "@/lib/dateOnly";
import { usePreferences } from "@/context/PreferencesContext";

function greeting(hour: number, name?: string | null): string {
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `Good ${part}, ${firstName}!` : `Good ${part}!`;
}

function memorySourceLabel(source?: string | null): string | null {
  if (source === "meals") return "from meal ratings";
  if (source === "chat") return "from chat";
  if (source === "auto") return "automatically learned";
  return null;
}

// ── AI Chat ──────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";
interface Message { role: Role; content: string; images?: string[]; memorized?: string[]; }

const EXAMPLE_PROMPT = "What should we have for dinner tonight?";

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className={`max-w-[90%] sm:max-w-[80%] space-y-1.5 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {msg.images?.map((src, i) => (
          <img key={i} src={src} alt="attached" className="rounded-xl max-h-40 object-cover border border-border" />
        ))}
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-border text-foreground rounded-tl-sm shadow-sm"
        }`}>
          {msg.content}
        </div>
        {msg.memorized && msg.memorized.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {msg.memorized.map((fact, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/8 border border-primary/20 text-primary text-[10px] font-semibold rounded-full">
                <Brain className="w-3 h-3" /> Remembered: {fact}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-2.5 justify-start">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-card border border-border shadow-sm flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

// Collapsed, the assistant is a single ask bar so past conversations don't
// crowd the overview; sending a message (or tapping "Continue") opens it.
function HouseholdChat({ defaultExpanded }: { defaultExpanded: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [lastFailedMsg, setLastFailedMsg] = useState<Message | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearHistoryError, setClearHistoryError] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [deleteMemoryErrorId, setDeleteMemoryErrorId] = useState<number | null>(null);

  const {
    data: memoriesData,
    isError: isMemoriesError,
    isFetching: isMemoriesLoading,
    refetch: loadMemories
  } = useListAiMemories({
    query: { queryKey: getListAiMemoriesQueryKey(), retry: false }
  });
  const memories = memoriesData?.memories ?? [];
  const deleteMemoryMutation = useDeleteAiMemory();

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view. Without this, new replies can land
  // below the fold of the chat's own small scroll region and the person
  // has to go hunt for them — especially disorienting on a phone screen.
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, expanded]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const res = await fetch("/api/ai/chat/history", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load chat history");
      const data = await res.json();
      const restored: Message[] = Array.isArray(data.messages)
        ? data.messages
          .filter((message: any) =>
            (message?.role === "user" || message?.role === "assistant") &&
            typeof message?.content === "string",
          )
          .map((message: any) => ({
            role: message.role,
            content: message.content,
            images: Array.isArray(message.images)
              ? message.images.filter((image: unknown) =>
                  typeof image === "string" &&
                  image.startsWith("/api/ai/chat/attachments/"),
                )
              : undefined,
          }))
        : [];
      setMessages(restored);
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleDeleteMemory = (id: number) => {
    setDeleteMemoryErrorId(null);
    deleteMemoryMutation.mutate({ id: String(id) }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAiMemoriesQueryKey() }); },
      onError: () => { setDeleteMemoryErrorId(id); }
    });
  };

  const clearHistory = async () => {
    setClearingHistory(true);
    setClearHistoryError(false);
    try {
      const res = await fetch("/api/ai/chat/history", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to clear chat history");
      setMessages([]);
    } catch {
      setClearHistoryError(true);
    } finally {
      setClearingHistory(false);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const dataUrls = await Promise.all(Array.from(files).slice(0, 3).map(readFileAsDataUrl));
    setImages(prev => [...prev, ...dataUrls].slice(0, 3));
  };

  const send = async (text = input, overrideImages?: string[]) => {
    const imagesToUse = overrideImages ?? images;
    if (historyLoading || loading || (!text.trim() && imagesToUse.length === 0)) return;
    const userMsg: Message = { role: "user", content: text.trim(), images: imagesToUse.length > 0 ? [...imagesToUse] : undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setExpanded(true);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
    setImages([]);
    setLoading(true);

    setChatError(false);
    setLastFailedMsg(null);
    try {
      const profileResponse = await fetch("/api/me", { credentials: "include" });
      if (!profileResponse.ok) {
        const profileData = await profileResponse.json();
        throw new Error(profileData.error ?? "Sign in to use the household assistant");
      }
      const res = await fetch(`/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          images: userMsg.images,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.reply, memorized: data.memorized ?? [] },
      ]);
      if (data.memorized?.length > 0) void loadMemories();

      const changedDomains = new Set(
        Array.isArray(data.changedDomains)
          ? data.changedDomains.filter((domain: unknown) =>
              domain === "meals" ||
              domain === "groceries" ||
              domain === "maintenance" ||
              domain === "chores",
            )
          : [],
      );
      if (changedDomains.size > 0) {
        const queryRoots = {
          dashboard: String(getGetDashboardQueryKey()[0]),
          meals: String(getGetMealPlansQueryKey()[0]),
          groceries: String(getGetGroceryListsQueryKey()[0]),
          maintenance: String(getGetMaintenanceTasksQueryKey()[0]),
          chores: String(getGetChoresQueryKey()[0]),
        };
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const root = String(query.queryKey[0] ?? "");
            if (root === queryRoots.dashboard) return true;
            if (changedDomains.has("meals") && root.startsWith(queryRoots.meals)) return true;
            if (changedDomains.has("groceries") && root.startsWith(queryRoots.groceries)) return true;
            if (changedDomains.has("maintenance") && root.startsWith(queryRoots.maintenance)) return true;
            return changedDomains.has("chores") && root.startsWith(queryRoots.chores);
          },
        });
      }
    } catch (err: any) {
      setMessages(prev => prev.slice(0, -1)); // Remove the user message from history
      setLastFailedMsg(userMsg);
      setChatError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(44, Math.min(el.scrollHeight, 120)) + "px";
  };

  const isEmpty = !historyLoading && !historyError && messages.length === 0;
  const showConversation = expanded || historyError;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {expanded ? (
        <div className="flex flex-wrap items-center gap-x-2 pl-5 pr-2 border-b border-border">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="w-4 h-4 text-primary" /> HomeHub Assistant
          </h2>
          <div className="ml-auto flex items-center">
            {clearHistoryError && (
              <div className="flex items-center gap-1.5 text-[11px] text-destructive font-medium mr-1" role="alert">
                <AlertTriangle className="w-3 h-3" /> Could not clear.
                <button onClick={clearHistory} disabled={clearingHistory} className="underline underline-offset-2 p-1">Retry</button>
              </div>
            )}
            <button
              onClick={() => setMemoryOpen(v => !v)}
              aria-expanded={memoryOpen}
              className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl text-xs font-semibold transition-colors ${
                memoryOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary hover:bg-primary/5"
              }`}
              title="View what the assistant remembers"
            >
              <Brain className="w-4 h-4" />
              {memories.length > 0 ? `${memories.length} memories` : "Memories"}
            </button>
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                disabled={clearingHistory || loading}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 min-h-[44px] rounded-xl hover:bg-muted disabled:opacity-40"
              >
                {clearingHistory ? "Clearing…" : "Clear"}
              </button>
            )}
            <button
              onClick={() => { setExpanded(false); setMemoryOpen(false); }}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 min-h-[44px] rounded-xl hover:bg-muted"
            >
              <ChevronUp className="w-4 h-4" /> Hide
            </button>
          </div>
        </div>
      ) : messages.length > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 px-5 min-h-[44px] border-b border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          Continue your conversation
          <span className="font-normal">· {messages.length} message{messages.length === 1 ? "" : "s"}</span>
          <ChevronDown className="w-4 h-4 ml-auto" />
        </button>
      )}

      {/* Memory panel */}
      {expanded && memoryOpen && (
        <div className="border-b border-border bg-primary/3 px-5 py-3">
          <p className="text-[11px] font-semibold text-primary/70 uppercase tracking-wider mb-2">
            What I know about your family
          </p>
          {isMemoriesError ? (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="w-3 h-3" />
              <span>Failed to load memories.</span>
              <button
                onClick={() => {
                  queryClient.resetQueries({ queryKey: getListAiMemoriesQueryKey() });
                  void loadMemories();
                }}
                disabled={isMemoriesLoading}
                className="underline font-semibold ml-1 disabled:opacity-50"
              >
                {isMemoriesLoading ? "Retrying..." : "Retry"}
              </button>
            </div>
          ) : isMemoriesLoading ? (
            <p className="text-xs text-muted-foreground py-1">Loading memories…</p>
          ) : memories.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              Nothing stored yet. Tell me your preferences and I'll remember them for next time.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {memories.map(m => {
                const isError = deleteMemoryErrorId === m.id;
                const isDeleting = deleteMemoryMutation.isPending && deleteMemoryMutation.variables?.id === String(m.id);
                return (
                  <div key={m.id} className="group flex flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <Brain className="w-3 h-3 text-primary/50 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug">{m.content}</p>
                        {memorySourceLabel(m.source) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{memorySourceLabel(m.source)}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteMemory(Number(m.id))}
                        disabled={isDeleting}
                        className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg opacity-100 lg:opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30 shrink-0 ml-1"
                        title="Forget this"
                      >
                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      </button>
                    </div>
                    {isError && (
                      <div className="flex items-center gap-1.5 text-[11px] text-destructive font-medium pl-5" role="alert">
                        <AlertTriangle className="w-3 h-3" /> Could not forget memory.
                        <button onClick={() => handleDeleteMemory(Number(m.id))} disabled={isDeleting} className="underline underline-offset-2 ml-1 p-1 disabled:opacity-50">Retry</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {showConversation && <div
        ref={messagesScrollRef}
        className={`overflow-y-auto overscroll-contain px-5 transition-all ${isEmpty && !historyError ? "h-0" : "max-h-[480px] py-4"}`}
      >
        <div className="space-y-4">
          {historyLoading && <p className="text-xs text-muted-foreground text-center py-2">Loading conversation…</p>}
          {historyError && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertTriangle className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-sm font-semibold text-foreground">Couldn't load chat history</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">Check your connection and try again.</p>
              <button
                onClick={() => void loadHistory()}
                disabled={historyLoading}
                className="bg-secondary/10 text-secondary border border-secondary/20 px-4 py-2 min-h-[44px] rounded-xl font-bold text-xs hover:bg-secondary/20 transition-colors disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          )}
          {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
          {loading && <ThinkingBubble />}
          {chatError && lastFailedMsg && (
            <div className="flex flex-col gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl mt-2 text-sm text-destructive" role="alert">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Something went wrong</p>
              <p>The assistant could not process your message.</p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => {
                    setInput(lastFailedMsg.content);
                    setImages(lastFailedMsg.images ?? []);
                    setChatError(false);
                    setLastFailedMsg(null);
                    setTimeout(autoResize, 0);
                  }}
                  className="bg-destructive text-destructive-foreground px-4 py-2 min-h-[44px] rounded-xl font-bold text-sm hover:bg-destructive/90 transition-colors"
                >
                  Restore message
                </button>
              </div>
            </div>
          )}
        </div>
      </div>}

      {/* Empty state hint */}
      {expanded && isEmpty && (
        <div className="px-5 pb-3 pt-1">
          <p className="text-xs text-muted-foreground">
            Ask anything —{" "}
            <button
              onClick={() => send(EXAMPLE_PROMPT)}
              className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
            >
              "{EXAMPLE_PROMPT}"
            </button>
          </p>
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="px-5 pt-3 flex gap-2 flex-wrap">
          {images.map((src, i) => (
            <div key={i} className="relative group">
              <img src={src} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-border" />
              <button
                onClick={() => setImages(imgs => imgs.filter((_, j) => j !== i))}
                aria-label="Remove photo"
                className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className={`px-4 py-3 flex items-end gap-2 bg-card ${showConversation ? "border-t border-border" : ""}`}>
        {!expanded && <Sparkles className="w-4 h-4 text-primary shrink-0 self-center" aria-hidden="true" />}
        <button
          onClick={() => fileRef.current?.click()}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
          title="Attach photo"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          disabled={historyLoading || loading}
          placeholder={expanded ? "Ask anything… or attach a photo" : "Ask HomeHub anything…"}
          aria-label="Ask the HomeHub Assistant"
          rows={1}
          className="flex-1 bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-base resize-none focus:outline-none focus:border-primary transition-colors min-h-[44px] max-h-[120px]"
          style={{ height: "44px" }}
        />

        <button
          onClick={() => send()}
          disabled={historyLoading || loading || (!input.trim() && images.length === 0)}
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 shrink-0"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function overdueWorkoutQuestion(scheduledDate: string | null, workoutDate: string): string {
  const dateStr = scheduledDate ?? workoutDate;
  const [year, month, day] = dateStr.split('-').map(Number);
  const scheduled = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAgo = Math.max(1, Math.round((today.getTime() - scheduled.getTime()) / 86_400_000));

  return daysAgo === 1
    ? "Did you complete your workout yesterday?"
    : `Did you complete your workout ${daysAgo} days ago?`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { preferences } = usePreferences();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  // Match the nav: sections for tabs the household turned off stay hidden here too.
  const tabOn = (tab: HomeHubWebTab) => !me?.visibleTabs || me.visibleTabs.includes(tab);
  const showChores = tabOn("chores");
  const showMeals = tabOn("meals");
  const showTodos = tabOn("tasks");
  const showMaintenance = tabOn("properties");
  const showWorkouts = tabOn("workouts");
  const showTasksArea = showTodos || showMaintenance;
  const summaryCardCount = [showChores, showMeals, showTasksArea].filter(Boolean).length;
  const {
    data: dashboard,
    isLoading,
    isFetching,
    isError,
    refetch: retryDashboard,
  } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), retry: false } });
  const { data: overdueSessions, isLoading: overdueLoading } = useGetOverdueWorkoutSessions({
    query: { queryKey: getGetOverdueWorkoutSessionsQueryKey() },
  });
  const completeSession = useCompleteWorkoutSession();
  const updateSessionStatus = useUpdateWorkoutSessionStatus();
  const overdueWorkout = overdueSessions?.[0];
  const isUpdatingOverdueWorkout = completeSession.isPending || updateSessionStatus.isPending;
  const [overdueError, setOverdueError] = useState<string | null>(null);

  const invalidateWorkoutViews = () => {
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOverdueWorkoutSessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWorkoutSessionsQueryKey() });
  };

  if (isLoading) {
    return <div className="p-8 animate-pulse flex flex-col gap-6">
      <div className="h-12 bg-muted rounded-xl w-1/3"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-2xl"></div>)}
      </div>
    </div>;
  }

  if (isError || !dashboard) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-destructive/30 bg-card px-5 py-12 text-center" role="alert">
        <AlertTriangle className="mb-3 h-10 w-10 text-destructive" />
        <h1 className="font-serif text-2xl font-bold">HomeHub couldn’t load</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Check your connection and try again. Your household information is still safe.
        </p>
        <button
          type="button"
          onClick={() => {
            queryClient.resetQueries({ queryKey: getGetDashboardQueryKey() });
            void retryDashboard();
          }}
          disabled={isFetching}
          className="mt-5 min-h-[44px] rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isFetching ? "Trying again..." : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-8">
      <div>
        <h1 className="text-4xl font-serif font-bold text-foreground mb-2">
          {greeting(new Date().getHours(), me?.linkedFamilyMemberName)}
        </h1>
        <p className="text-muted-foreground text-lg">Here's what's happening around the house today.</p>
      </div>

      {/* Workout follow-up */}
      {!showWorkouts ? null : overdueLoading ? (
        <div className="h-36 rounded-2xl bg-muted animate-pulse" data-testid="loading-overdue-workout" />
      ) : overdueWorkout ? (
        <aside className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-amber-100/50 p-5 shadow-sm" data-testid={`overdue-workout-${overdueWorkout.id}`}>
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[.13em] font-bold text-primary">Workout check-in</p>
              <h2 className="font-serif font-bold text-xl mt-0.5" data-testid={`text-overdue-workout-question-${overdueWorkout.id}`}>
                {overdueWorkoutQuestion(overdueWorkout.scheduledDate, overdueWorkout.workoutDate)}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {overdueWorkout.title} — a quick answer keeps your shared history up to date.
              </p>
              <div className="mt-4 flex flex-col gap-1 items-start">
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    data-testid={`button-complete-overdue-workout-${overdueWorkout.id}`}
                    onClick={() => { setOverdueError(null); completeSession.mutate({ id: overdueWorkout.id, data: {} }, { onSuccess: invalidateWorkoutViews, onError: () => setOverdueError("Failed to mark completed.") }) }}
                    disabled={isUpdatingOverdueWorkout}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 min-h-[44px] text-sm font-bold text-background hover:bg-foreground/90 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" /> Completed
                  </button>
                  <button
                    data-testid={`button-skip-overdue-workout-${overdueWorkout.id}`}
                    onClick={() => { setOverdueError(null); updateSessionStatus.mutate({ id: overdueWorkout.id, data: { status: "skipped" } }, { onSuccess: invalidateWorkoutViews, onError: () => setOverdueError("Failed to update status.") }) }}
                    disabled={isUpdatingOverdueWorkout}
                    className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 min-h-[44px] text-sm font-bold hover:bg-muted disabled:opacity-50"
                  >
                    Not completed
                  </button>
                  <button
                    data-testid={`button-dismiss-overdue-workout-${overdueWorkout.id}`}
                    onClick={() => { setOverdueError(null); updateSessionStatus.mutate({ id: overdueWorkout.id, data: { status: "dismissed" } }, { onSuccess: invalidateWorkoutViews, onError: () => setOverdueError("Failed to dismiss.") }) }}
                    disabled={isUpdatingOverdueWorkout}
                    className="inline-flex items-center justify-center rounded-xl px-4 min-h-[44px] text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
                {overdueError && <p className="text-xs text-destructive font-bold mt-1" role="alert">{overdueError} <button onClick={() => setOverdueError(null)} className="underline ml-1 px-2 py-3 inline-block">Clear</button></p>}
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {/* Summary cards */}
      {summaryCardCount > 0 && <div className={`grid grid-cols-1 ${summaryCardCount === 3 ? "md:grid-cols-3" : summaryCardCount === 2 ? "md:grid-cols-2" : ""} gap-6 ${preferences.tabs.home.focus === "assistant" ? "order-2" : "order-1"}`}>
        {showChores && <Link href="/chores" className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <Card className="bg-primary/10 border-primary/20 shadow-sm relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer">
            <div className="absolute -right-4 -top-4 opacity-10"><CheckCircle2 className="w-32 h-32" /></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-primary text-sm uppercase tracking-wider font-sans">Chores Due Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-serif font-bold text-primary">{dashboard.choresToday}</div>
              {dashboard.choresOverdue > 0 && (
                <p className="text-sm font-medium text-destructive mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {dashboard.choresOverdue} overdue
                </p>
              )}
              <p className="text-xs font-semibold text-primary/70 mt-3">View chores →</p>
            </CardContent>
          </Card>
        </Link>}

        {showMeals && <Link href="/meals" className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <Card className="bg-secondary/10 border-secondary/20 shadow-sm relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer">
            <div className="absolute -right-4 -top-4 opacity-10"><Utensils className="w-32 h-32" /></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-secondary text-sm uppercase tracking-wider font-sans">Today's Meals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-serif font-bold text-secondary">{dashboard.todaysMeals.length}</div>
              <p className="text-xs font-semibold text-secondary/70 mt-3">Open meal plan →</p>
            </CardContent>
          </Card>
        </Link>}

        {showTasksArea && <Link href={showTodos ? "/tasks" : "/tasks?view=maintenance"} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <Card className="bg-accent/20 border-accent/30 shadow-sm relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer">
            <div className="absolute -right-4 -top-4 opacity-10 text-accent-foreground"><CheckSquare className="w-32 h-32" /></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-accent-foreground text-sm uppercase tracking-wider font-sans">{showTodos ? "Tasks" : "Maintenance"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-5xl font-serif font-bold text-accent-foreground">{(showTodos ? dashboard.activeTodoItems : 0) + (showMaintenance ? dashboard.maintenanceDueSoon : 0)}</div>
              </div>
              {showMaintenance && dashboard.maintenanceOverdue > 0 && (
                <p className="text-sm font-medium text-destructive mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {dashboard.maintenanceOverdue} maintenance overdue
                </p>
              )}
              <p className="text-xs font-semibold text-accent-foreground/70 mt-3">
                {showTodos && showMaintenance ? "View to-dos and maintenance →" : showTodos ? "View to-dos →" : "View maintenance →"}
              </p>
            </CardContent>
          </Card>
        </Link>}
      </div>}

      {/* HomeHub Assistant */}
      <div className={preferences.tabs.home.focus === "assistant" ? "order-1" : "order-2"}>
        <HouseholdChat defaultExpanded={preferences.tabs.home.focus === "assistant"} />
      </div>

      {/* Main content */}
      {(showMeals || showTasksArea) && <div className={`order-3 grid grid-cols-1 ${showMeals && showTasksArea ? "lg:grid-cols-2" : ""} gap-8`}>
        {showMeals && <div className="space-y-6">
          <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2 inline-block">On the Menu</h2>
          {dashboard.todaysMeals.length === 0 ? (
            <Link href="/meals" className="block p-6 border-2 border-dashed border-border rounded-2xl text-center hover:border-primary/50 hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <p className="text-muted-foreground">Nothing planned for today yet.</p>
              <p className="text-xs font-semibold text-primary mt-2">Plan a meal →</p>
            </Link>
          ) : (
            <div className="space-y-4">
              {dashboard.todaysMeals.map(meal => (
                <Link key={meal.id} href="/meals" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  <Card className="border-l-4 border-l-secondary transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer">
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <Badge variant="outline" className="mb-2 bg-secondary/10 text-secondary border-secondary/20">{meal.mealType}</Badge>
                      <h3 className="font-semibold text-lg">{meal.meal}</h3>
                      {meal.notes && <p className="text-sm text-muted-foreground mt-1">{meal.notes}</p>}
                    </div>
                  </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>}

        {showTasksArea && <div className="space-y-6">
          <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2 inline-block">
            {showTodos && showMaintenance ? "Tasks & Maintenance" : showTodos ? "Tasks" : "Maintenance"}
          </h2>

          {showTodos && <Link href="/tasks?view=todos" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 mb-6">
            <Card className="border-l-4 border-l-accent transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer bg-accent/5 border-border">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg leading-tight">General To-dos</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {dashboard.activeTodoItems === 0
                      ? "All caught up on your to-do lists."
                      : `${dashboard.activeTodoItems} active task${dashboard.activeTodoItems === 1 ? '' : 's'} across your lists`}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                  <CheckSquare className="text-accent w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </Link>}

          {!showMaintenance ? null : dashboard.upcomingMaintenance.length === 0 ? (
            <Link href="/tasks?view=maintenance" className="block p-6 border-2 border-dashed border-border rounded-2xl text-center hover:border-primary/50 hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <p className="text-muted-foreground">House is in top shape!</p>
              <p className="text-xs font-semibold text-primary mt-2">View property maintenance →</p>
            </Link>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Property Maintenance</h3>
              {dashboard.upcomingMaintenance.map(task => (
                <Link key={task.id} href="/tasks?view=maintenance" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  <Card className={`border-l-4 ${task.isOverdue ? "border-l-destructive" : "border-l-orange-500"} transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer border-border`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg leading-tight">{task.title}</h3>

                      {task.isOverdue && <Badge variant="destructive" className="ml-2 whitespace-nowrap text-[10px]">Overdue</Badge>}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Due: {formatDateOnly(task.nextDueDate, "MMM d")}</span>
                      <span className="flex items-center gap-1 text-primary">{task.propertyName}</span>
                    </div>
                  </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>}
      </div>}
    </div>
  );
}
