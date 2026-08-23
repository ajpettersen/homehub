import React, { useState, useRef, useEffect, useCallback } from "react";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Clock, Utensils, AlertTriangle, CheckSquare,
  Sparkles, Send, Paperclip, X, Loader2, Brain, ChevronDown,
} from "lucide-react";
import { format } from "date-fns";

interface StoredMemory { id: number; content: string; createdAt: string; }

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
      <div className={`max-w-[80%] space-y-1.5 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
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
                💭 Remembered: {fact}
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

function HouseholdChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [memories, setMemories] = useState<StoredMemory[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/memories");
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const handleDeleteMemory = async (id: number) => {
    setDeletingId(id);
    await fetch(`/api/ai/memories/${id}`, { method: "DELETE" });
    setMemories(prev => prev.filter(m => m.id !== id));
    setDeletingId(null);
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

  const send = async (text = input) => {
    if (!text.trim() && images.length === 0) return;
    const userMsg: Message = { role: "user", content: text.trim(), images: images.length > 0 ? [...images] : undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setImages([]);
    setLoading(true);

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
      if (data.memorized?.length > 0) loadMemories();
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Try again in a moment." }]);
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
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h2 className="font-serif font-bold text-lg text-foreground leading-tight">HomeHub Assistant</h2>
          <p className="text-xs text-muted-foreground">Ask anything — workouts, meals, maintenance, family life</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Memory toggle */}
          <button
            onClick={() => setMemoryOpen(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              memoryOpen
                ? "bg-primary/10 text-primary border-primary/20"
                : "text-muted-foreground border-border hover:text-primary hover:border-primary/30 hover:bg-primary/5"
            }`}
            title="View what the assistant remembers"
          >
            <Brain className="w-3.5 h-3.5" />
            {memories.length > 0 ? `${memories.length} memories` : "No memories yet"}
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${memoryOpen ? "rotate-180" : ""}`} />
          </button>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Memory panel */}
      {memoryOpen && (
        <div className="border-b border-border bg-primary/3 px-5 py-3">
          <p className="text-[11px] font-semibold text-primary/70 uppercase tracking-wider mb-2">
            What I know about your family
          </p>
          {memories.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              Nothing stored yet. Tell me your preferences and I'll remember them for next time.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {memories.map(m => (
                <div key={m.id} className="group flex items-start gap-2">
                  <Brain className="w-3 h-3 text-primary/50 mt-0.5 shrink-0" />
                  <span className="text-xs text-foreground flex-1 leading-snug">{m.content}</span>
                  <button
                    onClick={() => handleDeleteMemory(m.id)}
                    disabled={deletingId === m.id}
                    className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-destructive rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30 shrink-0"
                    title="Forget this"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className={`overflow-y-auto px-5 transition-all ${isEmpty ? "h-0" : "max-h-[420px] py-4"}`}>
        <div className="space-y-4">
          {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
          {loading && <ThinkingBubble />}
        </div>
      </div>

      {/* Empty state hint */}
      {isEmpty && (
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
                className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-border flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
          title="Attach photo"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything… or attach a photo of your workout space"
          rows={1}
          className="flex-1 bg-muted/50 border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary transition-colors min-h-[36px] max-h-[120px]"
          style={{ height: "36px" }}
        />

        <button
          onClick={() => send()}
          disabled={loading || (!input.trim() && images.length === 0)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });

  if (isLoading) {
    return <div className="p-8 animate-pulse flex flex-col gap-6">
      <div className="h-12 bg-muted rounded-xl w-1/3"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-2xl"></div>)}
      </div>
    </div>;
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-serif font-bold text-foreground mb-2">
          Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, Family!
        </h1>
        <p className="text-muted-foreground text-lg">Here's what's happening around the house today.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/chores" className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
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
        </Link>

        <Link href="/meals" className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
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
        </Link>

        <Link href="/tasks" className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <Card className="bg-accent/20 border-accent/30 shadow-sm relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer">
            <div className="absolute -right-4 -top-4 opacity-10 text-accent-foreground"><CheckSquare className="w-32 h-32" /></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-accent-foreground text-sm uppercase tracking-wider font-sans">Active Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-serif font-bold text-accent-foreground">{dashboard.activeTodoItems}</div>
              <p className="text-xs font-semibold text-accent-foreground/70 mt-3">Open tasks →</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/properties" className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <Card className="bg-orange-100 border-orange-200 dark:bg-orange-950 dark:border-orange-900 shadow-sm relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer">
            <div className="absolute -right-4 -top-4 opacity-10 text-orange-600"><Clock className="w-32 h-32" /></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-orange-700 dark:text-orange-400 text-sm uppercase tracking-wider font-sans">Maintenance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-serif font-bold text-orange-700 dark:text-orange-400">{dashboard.maintenanceDueSoon}</div>
              {dashboard.maintenanceOverdue > 0 && (
                <p className="text-sm font-medium text-destructive mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {dashboard.maintenanceOverdue} overdue
                </p>
              )}
              <p className="text-xs font-semibold text-orange-700/70 dark:text-orange-400/70 mt-3">View maintenance →</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* HomeHub Assistant */}
      <HouseholdChat />

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
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
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2 inline-block">Upcoming Maintenance</h2>
          {dashboard.upcomingMaintenance.length === 0 ? (
            <Link href="/properties" className="block p-6 border-2 border-dashed border-border rounded-2xl text-center hover:border-primary/50 hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <p className="text-muted-foreground">House is in top shape!</p>
              <p className="text-xs font-semibold text-primary mt-2">View maintenance →</p>
            </Link>
          ) : (
            <div className="space-y-4">
              {dashboard.upcomingMaintenance.map(task => (
                <Link key={task.id} href="/properties" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                  <Card className={`border-l-4 ${task.isOverdue ? "border-l-destructive" : "border-l-orange-500"} transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg leading-tight">{task.title}</h3>
                      {task.isOverdue && <Badge variant="destructive" className="ml-2 whitespace-nowrap text-[10px]">Overdue</Badge>}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Due: {format(new Date(task.nextDueDate), "MMM d")}</span>
                      <span className="flex items-center gap-1 text-primary">{task.propertyName}</span>
                    </div>
                  </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
