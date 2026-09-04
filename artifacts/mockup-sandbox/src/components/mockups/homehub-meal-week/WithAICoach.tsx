import React, { FormEvent, useMemo, useState } from "react";
import { Bot, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, Home, ListChecks, Moon, Plus, Send, Sparkles, Trash2, Utensils, X } from "lucide-react";
import { addDays, format } from "date-fns";
import "./_group.css";

type Meal = { id: string; day: number; title: string; note?: string };
type Proposal = { id: string; day: number; title: string; note: string };
type Message = { id: string; by: "coach" | "user"; body: string };

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const baseMeals: Meal[] = [
  { id: "m1", day: 0, title: "Chicken fajita bowls", note: "Keep peppers separate" },
  { id: "m2", day: 1, title: "Lemon salmon, rice & peas" },
  { id: "m3", day: 2, title: "Emily's veggie lasagna", note: "Make ahead after pickup" },
  { id: "m4", day: 3, title: "Sheet-pan chicken & vegetables" },
  { id: "m5", day: 4, title: "Family pizza night", note: "Half cheese, half mushroom" },
  { id: "m6", day: 5, title: "Beef tacos with corn salad" },
  { id: "m7", day: 6, title: "Roast chicken Sunday supper" },
];
const initialMessages: Message[] = [
  { id: "c1", by: "coach", body: "I can keep this simple. Would you like me to look only at dinner, and leave breakfast and lunch just as they are?" },
  { id: "u1", by: "user", body: "I only want dinners planned, can you help with that?" },
  { id: "c2", by: "coach", body: "Absolutely. I’ll only suggest dinner changes. I noticed Tuesday is still open after soccer, so I made a gentle, low-lift proposal without touching the meals you already chose." },
];
const draft: Proposal[] = [
  { id: "p1", day: 1, title: "15-minute pesto pasta with broccoli", note: "Tuesday dinner · fast after soccer · uses pesto and pasta in your pantry" },
  { id: "p2", day: 3, title: "Chicken & veggie sheet pan", note: "Thursday dinner · keep the existing plan, just add a reminder to use the carrots" },
];
const navigation = [
  { Icon: Home, label: "Home" },
  { Icon: ListChecks, label: "Tasks" },
  { Icon: Utensils, label: "Meals" },
];

export function WithAICoach() {
  const [meals, setMeals] = useState(baseMeals);
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [proposal, setProposal] = useState(draft);
  const [editing, setEditing] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const monday = useMemo(() => new Date("2026-03-09T12:00:00"), []);

  const send = (event?: FormEvent, text = input) => {
    event?.preventDefault();
    if (!text.trim()) return;
    setMessages(old => [...old, { id: `u-${Date.now()}`, by: "user", body: text.trim() }, { id: `c-${Date.now()}`, by: "coach", body: "I’ve kept your existing dinners in place and refreshed the proposal below. You can edit or remove anything before applying it." }]);
    setInput("");
    setProposal(draft);
    setApplied(false);
  };
  const updateProposal = (id: string, title: string) => setProposal(items => items.map(item => item.id === id ? { ...item, title } : item));
  const apply = () => {
    setMeals(old => {
      const additions = proposal.filter(item => !old.some(meal => meal.day === item.day)).map(item => ({ id: `ai-${item.id}`, day: item.day, title: item.title, note: "Added with Meal Coach" }));
      return [...old, ...additions];
    });
    setProposal([]);
    setApplied(true);
    setMessages(old => [...old, { id: `applied-${Date.now()}`, by: "coach", body: "Done. I added the new dinner to Tuesday and preserved everything else in your week." }]);
  };
  const reset = () => { setProposal(draft); setApplied(false); };

  return <div className="homehub-meal-week min-h-[100dvh] bg-background flex overflow-hidden">
    <aside className="desktop-sidebar w-64 shrink-0 bg-card border-r border-border px-4 py-6 flex flex-col">
      <div className="flex items-center gap-3 px-2"><div className="w-10 h-10 bg-primary text-primary-foreground rounded-xl grid place-items-center font-serif text-xl font-bold -rotate-3">H</div><b className="font-serif text-2xl">HomeHub</b></div>
      <div className="mt-10 space-y-2">{navigation.map(({ Icon, label }) => <button key={label} className={`w-full flex gap-3 px-4 py-3 rounded-xl text-left font-semibold ${label === "Meals" ? "text-primary bg-primary/10" : "text-muted-foreground"}`}><Icon className="w-5 h-5"/>{label}</button>)}</div>
      <div className="mt-auto rounded-2xl bg-muted/50 p-4 border border-border/50"><p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">This week</p><p className="mt-2 text-sm font-semibold">Dinner plans are shared with AJ, Emily, Charlie & Sophie.</p></div>
    </aside>
    <main className="flex-1 min-w-0 h-[100dvh] overflow-y-auto pb-24">
      <header className="mobile-header px-4 py-3 bg-card border-b border-border items-center justify-between sticky top-0 z-10"><div className="flex items-center gap-2"><b className="w-8 h-8 grid place-items-center rounded-lg bg-primary text-primary-foreground font-serif -rotate-3">H</b><strong className="font-serif">HomeHub</strong></div><CircleUserRound className="w-6 h-6 text-primary"/></header>
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <button className="inline-flex gap-2 items-center text-sm font-bold text-muted-foreground"><ChevronLeft className="w-4 h-4"/> Back to Home</button>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs uppercase font-bold tracking-widest text-primary">Maple Street Home</p><h1 className="font-serif text-4xl md:text-5xl font-bold mt-1">Meals</h1><p className="text-muted-foreground mt-1">This week · Mar 9–15, 2026</p></div>
          <div className="flex gap-2"><button className="border border-border bg-card rounded-xl px-3 py-2.5"><ChevronLeft className="w-4 h-4"/></button><button className="border border-border bg-card rounded-xl px-4 py-2 text-sm font-bold">Today</button><button className="border border-border bg-card rounded-xl px-3 py-2.5"><ChevronRight className="w-4 h-4"/></button><button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-primary-foreground font-bold text-sm shadow-md shadow-primary/20"><Sparkles className="w-4 h-4"/>Meal Coach</button></div>
        </div>
        <div className="mt-7 flex gap-2 overflow-auto pb-1">{["Meal Plan","Shopping List","Cookbook"].map((tab,i) => <button key={tab} className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold ${i === 0 ? "bg-card border border-border shadow-sm" : "text-muted-foreground"}`}>{tab}</button>)}</div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {days.map((day, index) => { const meal = meals.find(item => item.day === index); return <section key={day} className={`min-h-40 rounded-2xl border-2 p-3 bg-card ${index === 3 ? "border-primary/30 shadow-md" : "border-border/60"}`}><div className="flex justify-between items-center"><b className={index===3 ? "text-primary" : ""}>{day}</b><span className="text-xs text-muted-foreground">{format(addDays(monday,index),"MMM d")}</span></div><div className="mt-4 text-[11px] font-bold text-primary/70 uppercase tracking-wide flex items-center gap-1"><Moon className="w-3.5 h-3.5"/> Dinner</div>{meal ? <div className="mt-2 rounded-xl bg-primary/5 border border-primary/15 p-2.5"><p className="text-sm font-semibold leading-snug">{meal.title}</p>{meal.note && <p className="text-xs text-muted-foreground mt-1">{meal.note}</p>}</div> : <button onClick={() => setOpen(true)} className="mt-2 min-h-12 w-full rounded-xl border border-dashed border-border text-muted-foreground text-sm flex items-center px-3 gap-2"><Plus className="w-4 h-4"/> Add dinner</button>}</section>; })}
        </div>
      </div>
      <nav className="mobile-tabs fixed bottom-0 left-0 right-0 z-20 bg-card border-t border-border">{navigation.map(({ Icon, label }) => <button key={label} className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] font-bold ${label==="Meals"?"text-primary":"text-muted-foreground"}`}><Icon className="w-5 h-5"/>{label}</button>)}</nav>
    </main>
    {open && <div className="fixed inset-0 z-30 md:relative md:inset-auto md:z-0">
      <button aria-label="Close Meal Coach" onClick={() => setOpen(false)} className="absolute inset-0 bg-foreground/25 md:hidden"/>
      <aside className="absolute bottom-0 left-0 right-0 max-h-[88dvh] md:relative md:h-[100dvh] md:w-[430px] md:max-h-none bg-[#fffaf2] border-l border-border shadow-2xl md:shadow-none rounded-t-[2rem] md:rounded-none flex flex-col overflow-hidden">
        <div className="px-5 pt-3 md:pt-5 border-b border-border bg-card"><div className="w-10 h-1 rounded-full bg-border mx-auto md:hidden"/><div className="py-4 flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary grid place-items-center"><Bot className="w-5 h-5"/></div><div className="flex-1"><h2 className="font-serif font-bold text-xl">Meal Coach</h2><p className="text-xs text-muted-foreground">A little help for this week</p></div><button onClick={() => setOpen(false)} className="w-11 h-11 grid place-items-center rounded-xl text-muted-foreground hover:bg-muted"><X className="w-5 h-5"/></button></div></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded-2xl bg-[#f5eadc] border border-[#ead8c2] p-3"><p className="text-xs font-bold text-primary uppercase tracking-wider">I remember</p><p className="mt-1 text-sm text-foreground">Charlie skipped salmon last time. Tuesday has soccer at 5:30. Your pantry has pesto, pasta and frozen broccoli.</p></div>
          {messages.map(message => <div key={message.id} className={`flex ${message.by==="user"?"justify-end":"justify-start"}`}><p className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${message.by==="user"?"bg-primary text-primary-foreground rounded-br-sm":"bg-card border border-border rounded-bl-sm"}`}>{message.body}</p></div>)}
          {proposal.length > 0 && <section className="rounded-2xl overflow-hidden border-2 border-primary/25 bg-card">
            <div className="p-3 bg-primary/5 flex items-start gap-2"><CalendarDays className="w-4 h-4 mt-0.5 text-primary"/><div><p className="font-bold text-sm">Proposed dinner changes</p><p className="text-xs text-muted-foreground mt-0.5">Nothing changes until you apply this.</p></div></div>
            <div className="p-2 space-y-2">{proposal.map(item => <div key={item.id} className="rounded-xl border border-border p-2.5"><div className="flex gap-2"><span className="text-xs font-bold text-primary w-14 pt-1">{days[item.day]}</span><div className="flex-1 min-w-0">{editing===item.id ? <input autoFocus value={item.title} onChange={e=>updateProposal(item.id,e.target.value)} onKeyDown={e=>e.key==="Enter"&&setEditing(null)} className="w-full text-sm font-semibold rounded-lg border border-primary px-2 py-1 bg-background"/> : <button onClick={()=>setEditing(item.id)} className="text-left text-sm font-semibold leading-snug">{item.title}</button>}<p className="text-xs text-muted-foreground mt-1">{item.note}</p></div><button onClick={()=>setProposal(all=>all.filter(p=>p.id!==item.id))} aria-label={`Remove ${item.title}`} className="w-10 h-10 grid place-items-center text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4"/></button></div></div>)}</div>
            <div className="p-3 pt-1"><button onClick={apply} className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4"/>Apply to week</button><button onClick={()=>setProposal([])} className="w-full mt-2 min-h-10 text-sm font-bold text-muted-foreground">Discard proposal</button></div>
          </section>}
          {applied && <div className="rounded-xl bg-[#e7f0e3] border border-[#b8d1af] p-3 text-sm font-semibold text-[#345a31]">Tuesday dinner is now in your week. The rest of your plan stayed put.</div>}
          {!proposal.length && !applied && <div className="rounded-xl p-5 text-center border border-dashed border-border"><Sparkles className="w-5 h-5 mx-auto text-primary"/><p className="mt-2 font-semibold text-sm">Your proposal is clear.</p><button onClick={reset} className="mt-2 text-sm font-bold text-primary">Restore proposed changes</button></div>}
        </div>
        <div className="p-3 bg-card border-t border-border"><div className="flex gap-2 overflow-auto pb-2">{["Make Tuesday fast","Use what we have","Avoid Charlie's skips"].map(text=><button key={text} onClick={()=>send(undefined,text)} className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary">{text}</button>)}</div><form onSubmit={send} className="flex gap-2"><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about your week…" className="flex-1 min-w-0 min-h-12 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"/><button aria-label="Send request" className="w-12 h-12 grid place-items-center rounded-xl bg-primary text-primary-foreground"><Send className="w-4 h-4"/></button></form></div>
      </aside>
    </div>}
  </div>;
}