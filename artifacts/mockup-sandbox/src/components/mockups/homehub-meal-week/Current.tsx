import React, { useMemo, useRef, useState } from "react";
import {
  Bookmark, Check, CheckSquare, ChevronDown, ChevronLeft, ChevronRight,
  Coffee, Home, House, Moon, Mountain, Plus, Settings, Sparkles, Sun,
  ThumbsDown, ThumbsUp, Utensils, X,
} from "lucide-react";
import { addDays, addWeeks, format } from "date-fns";
import "./_group.css";

type MealType = "breakfast" | "lunch" | "dinner";
type Rating = "love" | "ok" | "skip";
type Person = { id: string; name: string; color: string };
type Meal = {
  id: string;
  day: number;
  type: MealType;
  meal: string;
  notes?: string;
  saved?: boolean;
  ratings: Partial<Record<string, Rating>>;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PEOPLE: Person[] = [
  { id: "aj", name: "AJ", color: "#C65B3B" },
  { id: "emily", name: "Emily", color: "#6F8F62" },
  { id: "charlie", name: "Charlie", color: "#5478A6" },
  { id: "sophie", name: "Sophie", color: "#A66D91" },
];
const MEAL_TYPES = [
  { type: "breakfast" as const, label: "Breakfast", Icon: Coffee, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  { type: "lunch" as const, label: "Lunch", Icon: Sun, color: "text-sage-600", bg: "bg-green-50 border-green-200" },
  { type: "dinner" as const, label: "Dinner", Icon: Moon, color: "text-primary", bg: "bg-primary/5 border-primary/20" },
];
const INITIAL_MEALS: Meal[] = [
  { id: "m1", day: 0, type: "breakfast", meal: "Overnight oats & berries", saved: true, ratings: { aj: "ok", emily: "love", charlie: "ok", sophie: "love" } },
  { id: "m2", day: 0, type: "dinner", meal: "Chicken fajita bowls", notes: "Keep peppers separate for the kids", ratings: { aj: "love", emily: "love", charlie: "ok", sophie: "skip" } },
  { id: "m3", day: 1, type: "lunch", meal: "Turkey & avocado wraps", ratings: { aj: "ok", emily: "love", charlie: "love" } },
  { id: "m4", day: 1, type: "dinner", meal: "Lemon salmon, rice & peas", saved: true, ratings: { aj: "love", emily: "love", charlie: "skip", sophie: "ok" } },
  { id: "m5", day: 2, type: "breakfast", meal: "Scrambled eggs & toast", ratings: { aj: "love", emily: "ok", charlie: "love", sophie: "love" } },
  { id: "m6", day: 2, type: "dinner", meal: "Emily's veggie lasagna", saved: true, notes: "Make ahead after school pickup", ratings: { aj: "love", emily: "love", charlie: "ok", sophie: "ok" } },
  { id: "m7", day: 3, type: "lunch", meal: "Leftover veggie lasagna", ratings: { emily: "love", charlie: "ok" } },
  { id: "m8", day: 3, type: "dinner", meal: "Sheet-pan chicken & vegetables", ratings: { aj: "love", emily: "ok", charlie: "skip", sophie: "skip" } },
  { id: "m9", day: 4, type: "breakfast", meal: "Yogurt, granola & banana", ratings: { aj: "ok", emily: "love", sophie: "love" } },
  { id: "m10", day: 4, type: "dinner", meal: "Family pizza night", saved: true, notes: "Half cheese, half mushroom", ratings: { aj: "love", emily: "love", charlie: "love", sophie: "love" } },
  { id: "m11", day: 5, type: "lunch", meal: "Grilled cheese & tomato soup", ratings: { aj: "ok", emily: "ok", charlie: "love", sophie: "love" } },
  { id: "m12", day: 5, type: "dinner", meal: "Beef tacos with corn salad", ratings: { aj: "love", emily: "ok", charlie: "love", sophie: "ok" } },
  { id: "m13", day: 6, type: "breakfast", meal: "Blueberry pancakes", saved: true, ratings: { aj: "love", emily: "love", charlie: "love", sophie: "love" } },
  { id: "m14", day: 6, type: "dinner", meal: "Roast chicken Sunday supper", notes: "Dinner at 5:30 before bedtime routine", ratings: { aj: "love", emily: "love", charlie: "ok", sophie: "ok" } },
];
const AI_FILL = ["Apple cinnamon oatmeal", "Hummus snack boxes", "Pesto pasta with broccoli"];

const ratingIcon = (rating: Rating) => {
  if (rating === "love") return <span aria-label="Love it" className="text-[10px] text-red-500">♥</span>;
  if (rating === "ok") return <ThumbsUp aria-label="It's okay" className="w-2.5 h-2.5 text-amber-600" />;
  return <ThumbsDown aria-label="Skip next time" className="w-2.5 h-2.5 text-muted-foreground" />;
};

function MealSlot({
  meal, mealType, day, onCreate, onUpdate, onDelete,
}: {
  meal?: Meal;
  mealType: typeof MEAL_TYPES[number];
  day: string;
  onCreate: (name: string) => void;
  onUpdate: (meal: Meal) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [note, setNote] = useState(meal?.notes ?? "");
  const [savePrompt, setSavePrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = () => {
    if (value.trim()) onCreate(value.trim());
    setValue("");
    setEditing(false);
  };
  const cycle = (personId: string) => {
    if (!meal) return;
    const current = meal.ratings[personId];
    const next = current === undefined ? "love" : current === "love" ? "ok" : current === "ok" ? "skip" : undefined;
    const ratings = { ...meal.ratings };
    if (next) ratings[personId] = next; else delete ratings[personId];
    onUpdate({ ...meal, ratings });
  };
  const { Icon, color, bg } = mealType;

  if (meal) return (
    <div className={`rounded-xl border ${bg} overflow-hidden`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
        <span className="text-sm font-medium text-foreground flex-1 leading-snug">{meal.meal}</span>
        <button onClick={() => meal.saved ? undefined : setSavePrompt(v => !v)} title={meal.saved ? "Already in cookbook" : "Save to cookbook"} className={`w-5 h-5 flex items-center justify-center rounded-md shrink-0 ${meal.saved ? "text-primary opacity-70 cursor-default" : "text-muted-foreground/40 hover:text-primary"}`}>
          <Bookmark className={`w-3 h-3 ${meal.saved ? "fill-current" : ""}`} />
        </button>
        <button onClick={onDelete} aria-label={`Remove ${meal.meal}`} className="w-5 h-5 flex items-center justify-center text-muted-foreground/40 hover:text-destructive rounded-md shrink-0"><X className="w-3 h-3" /></button>
      </div>
      <div className="flex items-center gap-1 px-2 pb-2 flex-wrap">
        {PEOPLE.map(person => {
          const rating = meal.ratings[person.id];
          return <button key={person.id} onClick={() => cycle(person.id)} title={`${person.name}: ${rating ? ({ love: "Love it", ok: "It's okay", skip: "Skip next time" } as const)[rating] : "No rating — tap to rate"}`} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${rating === "love" ? "bg-red-100 border-red-300" : rating === "ok" ? "bg-amber-100 border-amber-300" : rating === "skip" ? "bg-muted border-border" : person.id === "aj" ? "border-primary/40 bg-primary/5 text-primary" : "border-border/50 text-muted-foreground/60"}`}>
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: person.color }}>{person.name[0]}</span>
            {rating ? ratingIcon(rating) : <Plus className="w-2.5 h-2.5 opacity-50" />}
          </button>;
        })}
      </div>
      <div className="flex items-center gap-1 px-2 pb-2">
        <button onClick={() => { setShowNotes(v => !v); setNote(meal.notes ?? ""); }} title="Add note" className={`w-6 h-6 flex items-center justify-center rounded-lg border ${(meal.notes || showNotes) ? "border-primary/30 text-primary bg-primary/5" : "border-transparent text-muted-foreground/40 hover:text-muted-foreground"}`}>
          <span className="text-[13px] leading-none">▤</span>
        </button>
      </div>
      {meal.notes && !showNotes && <p className="text-xs text-muted-foreground italic px-3 pb-2 leading-snug">{meal.notes}</p>}
      {showNotes && <div className="px-2 pb-2 flex gap-1">
        <input autoFocus value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { onUpdate({ ...meal, notes: note }); setShowNotes(false); } }} placeholder="Add a note…" className="flex-1 min-w-0 text-xs bg-background border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-primary" />
        <button onClick={() => { onUpdate({ ...meal, notes: note }); setShowNotes(false); }} className="w-6 h-6 flex items-center justify-center bg-primary text-primary-foreground rounded-lg shrink-0"><Check className="w-3 h-3" /></button>
      </div>}
      {savePrompt && !meal.saved && <div className="flex items-center gap-2 px-2 pb-2"><Bookmark className="w-3 h-3 text-primary" /><span className="text-xs text-muted-foreground flex-1">Save to cookbook?</span><button onClick={() => { onUpdate({ ...meal, saved: true }); setSavePrompt(false); }} className="text-xs font-bold text-primary hover:underline">Save</button><button onClick={() => setSavePrompt(false)} className="text-muted-foreground/50"><X className="w-3 h-3" /></button></div>}
    </div>
  );

  if (editing) return <div className="space-y-1">
    <div className="flex items-center gap-1 min-h-[2.75rem]">
      <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} placeholder={`${mealType.label}…`} className="flex-1 text-sm bg-background border-2 border-primary/40 rounded-xl px-3 py-2 focus:outline-none focus:border-primary min-w-0" />
      <button onClick={commit} className="w-8 h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-lg shrink-0"><Check className="w-4 h-4" /></button>
      <button onClick={() => setEditing(false)} className="w-8 h-8 flex items-center justify-center text-muted-foreground rounded-lg shrink-0"><X className="w-4 h-4" /></button>
    </div>
    <button className="text-xs text-primary/60 px-1">From URL instead</button>
  </div>;

  return <button onClick={() => { setEditing(true); window.setTimeout(() => inputRef.current?.focus(), 50); }} title={`Add ${mealType.label} for ${day}`} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground min-h-[2.75rem] group">
    <Icon className="w-3.5 h-3.5 shrink-0 opacity-50" /><span className="text-xs font-medium opacity-60 group-hover:opacity-100">{mealType.label}</span><Plus className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-60" />
  </button>;
}

const nav = [
  { label: "Home", Icon: Home }, { label: "Tasks", Icon: CheckSquare }, { label: "Meals", Icon: Utensils },
  { label: "Properties", Icon: Mountain }, { label: "Settings", Icon: Settings },
];

export function Current() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [meals, setMeals] = useState(INITIAL_MEALS);
  const [planning, setPlanning] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [property, setProperty] = useState("Maple Street Home");
  const monday = addWeeks(new Date("2026-03-09T12:00:00"), weekOffset);
  const currentMeals = weekOffset === 0 ? meals : [];
  const updateMeal = (updated: Meal) => setMeals(list => list.map(item => item.id === updated.id ? updated : item));
  const dateLabel = useMemo(() => `${format(monday, "MMM d")}–${format(addDays(monday, 6), "MMM d, yyyy")}`, [monday]);
  const planWeek = () => {
    setPlanning(true);
    window.setTimeout(() => {
      let index = 0;
      const additions: Meal[] = [];
      for (let day = 0; day < 7; day += 1) for (const type of ["breakfast", "lunch", "dinner"] as MealType[]) {
        if (!meals.some(meal => meal.day === day && meal.type === type) && index < AI_FILL.length) {
          additions.push({ id: `planned-${Date.now()}-${index}`, day, type, meal: AI_FILL[index], ratings: {} });
          index += 1;
        }
      }
      setMeals(list => [...list, ...additions]);
      setPlanning(false);
    }, 650);
  };

  return <div className="homehub-meal-week h-[100dvh] min-h-0 flex flex-col md:flex-row overflow-hidden">
    <aside className="desktop-sidebar w-64 h-[100dvh] bg-card border-r border-border flex flex-col shadow-sm shrink-0 p-4">
      <div className="flex items-center gap-3 px-2 mb-8 mt-2"><div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-serif font-bold text-xl shadow-md rotate-[-3deg]">H</div><span className="text-2xl font-serif font-bold">HomeHub</span></div>
      <nav className="flex-1 space-y-1">{nav.map(({ label, Icon }) => <button key={label} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${label === "Meals" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}><Icon className="w-5 h-5" />{label}</button>)}</nav>
      <div className="mt-8 p-4 bg-muted/30 rounded-2xl border border-border/50"><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Who's here?</label><div className="flex flex-col gap-1">{PEOPLE.map(person => <button key={person.id} className={`flex items-center gap-3 p-2 rounded-xl text-left ${person.id === "aj" ? "bg-white shadow-sm border border-border" : "border border-transparent hover:bg-black/5"}`}><span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: person.color }}>{person.name[0]}</span><span className="font-medium text-sm flex-1">{person.name}</span>{person.id === "aj" && <span className="w-2 h-2 rounded-full bg-green-500" />}</button>)}</div></div>
    </aside>

    <main className="flex-1 flex flex-col h-[100dvh] min-h-0 overflow-hidden">
      <header className="mobile-header items-center justify-between px-4 py-3 bg-card border-b border-border shrink-0"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground font-serif font-bold flex items-center justify-center rotate-[-3deg]">H</div><strong className="font-serif text-lg">HomeHub</strong></div><span className="flex items-center gap-2 text-sm"><span className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center" style={{ background: PEOPLE[0].color }}>A</span>AJ<ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /></span></header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 pb-24">
        <div className="max-w-6xl mx-auto">
          <button className="mb-5 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground shadow-sm"><ChevronLeft className="w-4 h-4" />Back to Home</button>
          <div className="mb-3 relative w-fit">
            <button onClick={() => setPropertyOpen(v => !v)} className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider"><House className="w-3.5 h-3.5 text-primary" />{property}<ChevronDown className="w-3.5 h-3.5" /></button>
            {propertyOpen && <div className="absolute top-full left-0 z-20 mt-2 min-w-52 bg-card border border-border rounded-xl shadow-lg p-1.5"><button onClick={() => { setProperty("Maple Street Home"); setPropertyOpen(false); }} className="w-full flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-primary text-sm font-bold"><House className="w-4 h-4" />Maple Street Home<Check className="w-4 h-4 ml-auto" /></button><button onClick={() => { setProperty("Lake Cabin"); setPropertyOpen(false); }} className="w-full flex items-center gap-2 p-2 rounded-lg text-muted-foreground text-sm"><Mountain className="w-4 h-4" />Lake Cabin</button></div>}
          </div>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight">Meals</h1><p className="text-muted-foreground mt-1 font-medium">{weekOffset === 0 ? "This week" : weekOffset < 0 ? "Past week" : "Next week"} · {dateLabel}</p></div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-card border border-border rounded-xl overflow-hidden shadow-sm"><button onClick={() => setWeekOffset(w => w - 1)} className="px-3 py-2.5 hover:bg-muted text-muted-foreground"><ChevronLeft className="w-4 h-4" /></button><button onClick={() => setWeekOffset(0)} className={`px-4 py-2.5 text-sm font-bold ${weekOffset === 0 ? "text-primary" : "text-muted-foreground"}`}>Today</button><button onClick={() => setWeekOffset(w => w + 1)} className="px-3 py-2.5 hover:bg-muted text-muted-foreground"><ChevronRight className="w-4 h-4" /></button></div>
              <button onClick={planWeek} disabled={planning || weekOffset !== 0} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md shadow-primary/20 disabled:opacity-60"><Sparkles className={`w-4 h-4 ${planning ? "animate-spin" : ""}`} />{planning ? "Planning…" : "Plan Week"}</button>
            </div>
          </div>
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-6 w-fit"><button className="px-5 py-2 rounded-lg font-bold text-sm bg-card shadow-sm">Meal Plan</button><button className="px-5 py-2 rounded-lg font-bold text-sm text-muted-foreground">Shopping List</button><button className="px-5 py-2 rounded-lg font-bold text-sm text-muted-foreground">Cookbook</button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {DAYS.map((day, dayIndex) => {
              const date = addDays(monday, dayIndex);
              const isToday = weekOffset === 0 && dayIndex === 3;
              return <div key={day} className={`space-y-2 bg-card rounded-2xl p-3 border-2 transition-all ${isToday ? "border-primary/30 shadow-md" : "border-border/50"}`}>
                <div className="flex items-center justify-between mb-1"><span className={`font-bold text-sm ${isToday ? "text-primary" : "text-foreground"}`}>{DAY_SHORT[dayIndex]}</span><span className={`text-xs font-medium ${isToday ? "text-primary bg-primary/10 px-1.5 py-0.5 rounded-md" : "text-muted-foreground"}`}>{format(date, "MMM d")}</span></div>
                {MEAL_TYPES.map(mealType => {
                  const meal = currentMeals.find(item => item.day === dayIndex && item.type === mealType.type);
                  return <MealSlot key={mealType.type} meal={meal} mealType={mealType} day={day} onCreate={name => {
                    if (weekOffset !== 0) return;
                    setMeals(list => [...list, { id: `manual-${Date.now()}`, day: dayIndex, type: mealType.type, meal: name, ratings: {} }]);
                  }} onUpdate={updateMeal} onDelete={() => meal && setMeals(list => list.filter(item => item.id !== meal.id))} />;
                })}
              </div>;
            })}
          </div>
        </div>
      </div>
      <nav className="mobile-tabs fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border items-stretch">{nav.map(({ label, Icon }) => <button key={label} className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-3 ${label === "Meals" ? "text-primary" : "text-muted-foreground"}`}><Icon className="w-5 h-5" /><span className="text-[9px] font-semibold">{label}</span></button>)}</nav>
    </main>
  </div>;
}