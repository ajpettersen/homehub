import React, { useState } from "react";
import {
  Activity, BookOpen, Calendar, Check, ChevronDown, ChevronUp, Clock,
  Flame, History, Pencil, Plus, Search, Send, Settings, Sparkles,
  Trash2, User, X
} from "lucide-react";
import { format } from "date-fns";
import "./_group.css";

type Muscle = "full_body" | "chest" | "back" | "shoulders" | "arms" | "core" | "glutes" | "quadriceps" | "hamstrings" | "calves" | "cardio" | "mobility";
type Exercise = { id?: string; name: string; muscleGroups: Muscle[]; sets: number | null; reps: number | null; weightLbs: number | null; durationSeconds: number | null; notes?: string | null };
type Draft = { title: string; durationMinutes: number; notes?: string | null; rationale?: string; exercises: Exercise[] };
type Member = { id: string; name: string; color: string };
type Workout = { id: string; title: string; workoutDate: string; durationMinutes: number; notes: string; participantIds: string[]; participants: Member[]; exercises: Exercise[] };

const MUSCLE_GROUPS: Muscle[] = ["full_body", "chest", "back", "shoulders", "arms", "core", "glutes", "quadriceps", "hamstrings", "calves", "cardio", "mobility"];
const formatMuscleGroup = (mg: string) => mg.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
const AJ: Member = { id: "aj", name: "AJ", color: "#C65B3B" };
const EMILY: Member = { id: "emily", name: "Emily", color: "#6F8F62" };
const MEMBERS = [AJ, EMILY];

const START_WORKOUTS: Workout[] = [
  {
    id: "w1", title: "Full Body Strength", workoutDate: "2026-03-10", durationMinutes: 48,
    notes: "Great session together — last set of squats felt strong.", participantIds: ["aj", "emily"], participants: MEMBERS,
    exercises: [
      { id: "e1", name: "Goblet Squat", muscleGroups: ["quadriceps", "glutes"], sets: 4, reps: 10, weightLbs: 45, durationSeconds: null },
      { id: "e2", name: "Dumbbell Bench Press", muscleGroups: ["chest", "arms"], sets: 3, reps: 10, weightLbs: 40, durationSeconds: null },
      { id: "e3", name: "One-Arm Dumbbell Row", muscleGroups: ["back", "arms"], sets: 3, reps: 12, weightLbs: 35, durationSeconds: null },
      { id: "e4", name: "Plank", muscleGroups: ["core"], sets: 3, reps: null, weightLbs: null, durationSeconds: 150 }
    ]
  },
  {
    id: "w2", title: "Morning Run + Mobility", workoutDate: "2026-03-08", durationMinutes: 38,
    notes: "Easy conversational pace. Hips loosened up after the warm-up.", participantIds: ["emily"], participants: [EMILY],
    exercises: [
      { id: "e5", name: "Outdoor Run", muscleGroups: ["cardio"], sets: null, reps: null, weightLbs: null, durationSeconds: 1800 },
      { id: "e6", name: "Hip Flexor Flow", muscleGroups: ["mobility"], sets: 2, reps: null, weightLbs: null, durationSeconds: 480 }
    ]
  },
  {
    id: "w3", title: "Upper Body Power", workoutDate: "2026-03-05", durationMinutes: 52,
    notes: "Added five pounds to the press with clean reps.", participantIds: ["aj"], participants: [AJ],
    exercises: [
      { id: "e7", name: "Barbell Bench Press", muscleGroups: ["chest", "arms"], sets: 5, reps: 5, weightLbs: 155, durationSeconds: null },
      { id: "e8", name: "Pull-Up", muscleGroups: ["back", "arms"], sets: 4, reps: 7, weightLbs: null, durationSeconds: null },
      { id: "e9", name: "Overhead Press", muscleGroups: ["shoulders", "arms"], sets: 3, reps: 8, weightLbs: 85, durationSeconds: null }
    ]
  }
];

const LIBRARY_START = [
  { id: "l1", name: "Goblet Squat", muscleGroups: ["quadriceps", "glutes"] as Muscle[] },
  { id: "l2", name: "Dumbbell Bench Press", muscleGroups: ["chest", "arms"] as Muscle[] },
  { id: "l3", name: "Push-Up", muscleGroups: ["chest", "arms", "core"] as Muscle[] },
  { id: "l4", name: "One-Arm Dumbbell Row", muscleGroups: ["back", "arms"] as Muscle[] },
  { id: "l5", name: "Pull-Up", muscleGroups: ["back", "arms"] as Muscle[] },
  { id: "l6", name: "Overhead Press", muscleGroups: ["shoulders", "arms"] as Muscle[] },
  { id: "l7", name: "Biceps Curl", muscleGroups: ["arms"] as Muscle[] },
  { id: "l8", name: "Dead Bug", muscleGroups: ["core"] as Muscle[] },
  { id: "l9", name: "Romanian Deadlift", muscleGroups: ["hamstrings", "glutes"] as Muscle[] },
  { id: "l10", name: "Standing Calf Raise", muscleGroups: ["calves"] as Muscle[] },
  { id: "l11", name: "Outdoor Run", muscleGroups: ["cardio"] as Muscle[] },
  { id: "l12", name: "Hip Flexor Flow", muscleGroups: ["mobility"] as Muscle[] }
];

const COACH_DRAFT: Draft = {
  title: "Couples Dumbbell Circuit", durationMinutes: 35,
  rationale: "A balanced strength circuit using the dumbbells you have, with alternating stations so AJ and Emily can train together.",
  notes: "Move steadily, resting 60 seconds between rounds.",
  exercises: [
    { name: "Goblet Squat", muscleGroups: ["quadriceps", "glutes"], sets: 3, reps: 12, weightLbs: 35, durationSeconds: null },
    { name: "Dumbbell Floor Press", muscleGroups: ["chest", "arms"], sets: 3, reps: 10, weightLbs: 30, durationSeconds: null },
    { name: "One-Arm Dumbbell Row", muscleGroups: ["back", "arms"], sets: 3, reps: 10, weightLbs: 30, durationSeconds: null }
  ]
};

function EditableDraftWorkout({ draft, onUpdate }: { draft: Draft; onUpdate: (d: Draft) => void }) {
  const updateEx = (i: number, field: keyof Exercise, value: unknown) => {
    const exercises = [...draft.exercises];
    exercises[i] = { ...exercises[i], [field]: value };
    onUpdate({ ...draft, exercises });
  };
  return (
    <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-sm space-y-4">
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Title</label>
        <input value={draft.title} onChange={e => onUpdate({ ...draft, title: e.target.value })} className="w-full bg-background border border-border rounded-lg px-3 py-2 font-bold focus:outline-none focus:border-primary" />
      </div>
      {draft.rationale && <div className="bg-primary/5 border border-primary/10 p-3 rounded-xl text-sm italic text-foreground/80">{draft.rationale}</div>}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Exercises</h4>
        {draft.exercises.map((ex, i) => (
          <div key={i} className="bg-background border border-border rounded-xl p-3 relative group">
            <button onClick={() => onUpdate({ ...draft, exercises: draft.exercises.filter((_, n) => n !== i) })} className="absolute -right-2 -top-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-sm"><Trash2 className="w-3 h-3" /></button>
            <input value={ex.name} onChange={e => updateEx(i, "name", e.target.value)} className="w-full bg-transparent border-b border-border/50 px-1 py-1 font-bold text-sm focus:outline-none focus:border-primary" />
            <div className="flex flex-wrap gap-1 my-3">
              {MUSCLE_GROUPS.map(mg => <button key={mg} type="button" onClick={() => updateEx(i, "muscleGroups", ex.muscleGroups.includes(mg) ? ex.muscleGroups.filter(x => x !== mg) || ["full_body"] : [...ex.muscleGroups, mg])} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${ex.muscleGroups.includes(mg) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent"}`}>{formatMuscleGroup(mg)}</button>)}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {([["sets", "Sets"], ["reps", "Reps"], ["weightLbs", "Lbs"]] as const).map(([field, label]) => <label key={field} className="text-[10px] text-muted-foreground font-bold uppercase">{label}<input type="number" value={ex[field] || ""} onChange={e => updateEx(i, field, Number(e.target.value) || null)} className="mt-0.5 w-full bg-muted/30 border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none" /></label>)}
              <label className="text-[10px] text-muted-foreground font-bold uppercase">Mins<input type="number" value={ex.durationSeconds ? ex.durationSeconds / 60 : ""} onChange={e => updateEx(i, "durationSeconds", Number(e.target.value) * 60 || null)} className="mt-0.5 w-full bg-muted/30 border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none" /></label>
            </div>
          </div>
        ))}
        <button onClick={() => onUpdate({ ...draft, exercises: [...draft.exercises, { name: "", muscleGroups: ["full_body"], sets: null, reps: null, weightLbs: null, durationSeconds: null }] })} className="w-full py-2 border-2 border-dashed border-border text-muted-foreground hover:text-primary rounded-xl flex justify-center items-center gap-1 text-xs font-bold"><Plus className="w-3 h-3" /> Add Exercise</button>
      </div>
    </div>
  );
}

function WorkoutHistory({ workouts, bothSelected, removeWorkout }: { workouts: Workout[]; bothSelected: boolean; removeWorkout: (id: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(workouts[0]?.id || null);
  return <div className="space-y-4">{workouts.map(workout => {
    const open = expanded === workout.id;
    return <div key={workout.id} className={`bg-card rounded-2xl border-2 transition-all overflow-hidden ${open ? "border-primary/40 shadow-md" : "border-border shadow-sm"}`}>
      <div className="p-4 cursor-pointer flex items-start gap-4 select-none" onClick={() => setExpanded(open ? null : workout.id)}>
        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><Flame className="w-6 h-6" /></div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex justify-between gap-2"><h3 className="font-serif font-bold text-lg truncate">{workout.title}</h3><span className="text-xs font-bold text-muted-foreground whitespace-nowrap bg-muted px-2 py-1 rounded-md">{format(new Date(`${workout.workoutDate}T12:00:00`), "MMM d, yyyy")}</span></div>
          <div className="flex items-center gap-4 mt-1.5 text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5"><Activity className="w-4 h-4" />{workout.exercises.length} exercises</span>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{workout.durationMinutes} min</span>
            {bothSelected && <div className="ml-auto flex gap-1">{workout.participants.map(p => <span key={p.id} className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase" style={{ backgroundColor: p.color }}>{p.name}</span>)}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2"><button onClick={e => { e.stopPropagation(); removeWorkout(workout.id); }} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md"><Trash2 className="w-4 h-4" /></button>{open ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}</div>
      </div>
      {open && <div className="border-t border-border bg-muted/10 p-4 pt-2">
        <p className="text-sm text-foreground/80 italic mb-4 mt-2 border-l-2 border-primary/40 pl-3 py-1">"{workout.notes}"</p>
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Exercises</h4>
        <div className="space-y-2">{workout.exercises.map(ex => <div key={ex.id || ex.name} className="py-2 px-3 bg-muted/40 rounded-lg border border-border/50">
          <div className="flex items-center gap-2"><p className="font-bold text-sm">{ex.name}</p>{ex.muscleGroups.map(m => <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">{formatMuscleGroup(m)}</span>)}</div>
          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 font-medium">{ex.sets && ex.reps && <span>{ex.sets} sets × {ex.reps} reps</span>}{ex.weightLbs && <span>{ex.weightLbs} lbs</span>}{ex.durationSeconds && <span>{Math.floor(ex.durationSeconds / 60)}m</span>}</div>
        </div>)}</div>
        <button className="mt-4 w-full py-2.5 rounded-lg border-2 border-dashed border-primary/30 text-primary font-bold text-sm flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add Exercise</button>
      </div>}
    </div>;
  })}</div>;
}

const WEEK_DRAFTS = [
  { date: "2026-03-16", workout: { ...COACH_DRAFT, title: "Monday Full Body Foundation", durationMinutes: 45 } },
  { date: "2026-03-18", workout: { ...COACH_DRAFT, title: "Wednesday Upper Body + Core", durationMinutes: 40, exercises: COACH_DRAFT.exercises.slice(1) } },
  { date: "2026-03-20", workout: { ...COACH_DRAFT, title: "Friday Lower Body Strength", durationMinutes: 45, exercises: [COACH_DRAFT.exercises[0]] } }
];

function WorkoutWeeklyPlan({ onSaved }: { onSaved: () => void }) {
  const [showSettings, setShowSettings] = useState(false);
  const [days, setDays] = useState([1, 3, 5]);
  const [goals, setGoals] = useState("Build strength together and improve overall conditioning");
  const [duration, setDuration] = useState(45);
  const [equipment, setEquipment] = useState("Adjustable dumbbells, resistance bands, yoga mat");
  const [limitations, setLimitations] = useState("Emily: protect left knee; AJ: avoid high-impact jumping");
  const [plan, setPlan] = useState<typeof WEEK_DRAFTS | null>(null);
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return <div className="space-y-6">
    {!plan ? <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
      <div className="flex justify-between items-start mb-6"><div><h2 className="font-serif font-bold text-2xl mb-1">Weekly AI Planner</h2><p className="text-muted-foreground text-sm">Generate a tailored weekly schedule based on your goals.</p></div><button onClick={() => setShowSettings(!showSettings)} className="p-2 bg-muted/50 rounded-lg text-muted-foreground"><Settings className="w-5 h-5" /></button></div>
      {showSettings ? <div className="bg-muted/30 p-4 rounded-2xl border border-border space-y-4 mb-6">
        <h3 className="font-bold text-sm uppercase tracking-wider">Plan Settings</h3>
        <div><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Workout Days</label><div className="flex gap-2">{labels.map((d, i) => <button key={d} onClick={() => setDays(days.includes(i) ? days.filter(x => x !== i) : [...days, i])} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${days.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}>{d}</button>)}</div></div>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-xs font-bold text-muted-foreground uppercase">Goals<input value={goals} onChange={e => setGoals(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-normal" /></label>
          <label className="text-xs font-bold text-muted-foreground uppercase">Session Duration<input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-normal" /></label>
          <label className="text-xs font-bold text-muted-foreground uppercase">Equipment<input value={equipment} onChange={e => setEquipment(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-normal" /></label>
          <label className="text-xs font-bold text-muted-foreground uppercase">Limitations<input value={limitations} onChange={e => setLimitations(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground font-normal" /></label>
        </div>
        <button onClick={() => setShowSettings(false)} className="w-full py-2 bg-foreground text-background font-bold rounded-lg">Save Preferences</button>
      </div> : <div className="flex gap-4 items-center bg-primary/5 border border-primary/20 p-4 rounded-2xl mb-6"><div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><Calendar className="w-6 h-6 text-primary" /></div><div className="text-sm"><p><strong>Goal:</strong> {goals}</p><p><strong>Days:</strong> {days.map(d => labels[d]).join(", ")}</p><p><strong>Time:</strong> {duration} mins</p></div></div>}
      <button onClick={() => setPlan(WEEK_DRAFTS)} className="w-full py-4 bg-primary text-primary-foreground font-bold text-lg rounded-xl shadow-md shadow-primary/20 flex justify-center items-center gap-2"><Sparkles className="w-5 h-5" /> Generate Next Week's Plan</button>
    </div> : <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-4 rounded-2xl border border-border sticky top-0 z-10 shadow-sm"><div><h2 className="font-bold text-lg">Review Schedule</h2><p className="text-xs text-muted-foreground">Adjust drafts as needed before saving.</p></div><div className="flex gap-2"><button onClick={() => setPlan(null)} className="px-4 py-2 border border-border rounded-lg text-sm font-bold">Cancel</button><button onClick={onSaved} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2"><Check className="w-4 h-4" /> Save Schedule</button></div></div>
      {plan.map((item, i) => <div key={item.date} className="bg-card border border-border p-4 rounded-3xl shadow-sm"><h3 className="font-serif font-bold text-xl mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" />{format(new Date(`${item.date}T12:00:00`), "EEEE, MMM d")}</h3><EditableDraftWorkout draft={item.workout} onUpdate={workout => setPlan(plan.map((p, n) => n === i ? { ...p, workout } : p))} /></div>)}
    </div>}
  </div>;
}

function WorkoutCoach({ onLogged }: { onLogged: () => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { id: "c1", role: "user", content: "Emily and I have 35 minutes tonight. We have dumbbells and want a balanced session." },
    { id: "c2", role: "assistant", content: "Absolutely — I built a shared circuit that alternates lower and upper body work, with knee-friendly options for Emily." }
  ]);
  const [draft, setDraft] = useState<Draft | null>(COACH_DRAFT);
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const request = input.trim();
    if (!request) return;
    const lower = request.toLowerCase();
    const nextDraft = lower.includes("run") || lower.includes("cardio")
      ? { ...COACH_DRAFT, title: "Shared Conditioning Circuit", rationale: "I shaped this around your request with a steady cardio block and strength intervals that AJ and Emily can do side by side." }
      : { ...COACH_DRAFT, title: "Custom session for AJ + Emily", rationale: "I translated your request into an editable shared session, balancing the muscle groups and keeping the pacing realistic." };
    setMessages([...messages, { id: String(Date.now()), role: "user", content: request }, { id: `${Date.now()}a`, role: "assistant", content: "I read your request and drafted a session below. Edit anything before you save it." }]);
    setDraft(nextDraft);
    setInput("");
  };
  return <div className="flex flex-col h-[600px] max-h-[80vh] bg-card border-2 border-border rounded-3xl overflow-hidden">
    <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Sparkles className="w-5 h-5" /></div><div><h2 className="font-bold text-lg leading-tight">AI Workout Coach</h2><p className="text-xs text-muted-foreground">Describe what you want. I’ll shape an editable session.</p></div><span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded-full">Live draft</span></div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map(m => <div key={m.id} className={`flex gap-3 max-w-[85%] ${m.role === "user" ? "ml-auto flex-row-reverse" : ""}`}><div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>{m.role === "user" ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}</div><div className={`p-3 rounded-2xl text-sm ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"}`}>{m.content}</div></div>)}
      {draft && <div className="pt-2"><EditableDraftWorkout draft={draft} onUpdate={setDraft} /><button onClick={onLogged} className="w-full mt-3 py-3 font-bold rounded-xl bg-primary text-primary-foreground flex justify-center items-center gap-2"><Activity className="w-5 h-5" /> Log This Workout</button><button onClick={() => setDraft(null)} className="w-full mt-2 py-2 font-bold rounded-xl border border-border text-muted-foreground">Discard Draft</button></div>}
    </div>
    <div className="p-4 bg-background border-t border-border"><div className="flex flex-wrap gap-1.5 mb-2"><button type="button" onClick={() => setInput("Make this a 30-minute low-impact session for both of us")} className="text-[11px] font-medium rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:border-primary hover:text-primary">30-minute low impact</button><button type="button" onClick={() => setInput("Build a dumbbell workout with extra back and core work")} className="text-[11px] font-medium rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:border-primary hover:text-primary">More back + core</button></div><form onSubmit={send} className="relative"><textarea value={input} onChange={e => setInput(e.target.value)} rows={2} placeholder="Tell the coach what you want to do..." className="w-full resize-none bg-muted/50 border border-border rounded-2xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-primary" /><button disabled={!input.trim()} className="absolute right-2 bottom-2 w-9 h-9 flex items-center justify-center bg-primary text-primary-foreground rounded-xl disabled:opacity-50"><Send className="w-4 h-4" /></button></form></div>
  </div>;
}

function ExerciseLibrary() {
  const [items, setItems] = useState(LIBRARY_START);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<(typeof LIBRARY_START)[number] | null>(null);
  const [name, setName] = useState("");
  const filtered = items.filter(x => x.name.toLowerCase().includes(search.toLowerCase()));
  const groups = MUSCLE_GROUPS.map(m => ({ muscle: m, items: filtered.filter(x => x.muscleGroups[0] === m) })).filter(g => g.items.length);
  const form = <div className="bg-card border-2 border-primary/20 rounded-xl p-4 shadow-sm mb-4"><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Exercise Name<input autoFocus value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground" /></label><div className="flex gap-2 pt-4"><button onClick={() => { setAdding(false); setEditing(null); }} className="flex-1 py-2 font-bold rounded-lg border border-border">Cancel</button><button onClick={() => { if (editing) setItems(items.map(x => x.id === editing ? { ...x, name } : x)); else setItems([...items, { id: String(Date.now()), name, muscleGroups: ["full_body"] }]); setAdding(false); setEditing(null); }} className="flex-1 py-2 font-bold rounded-lg bg-primary text-primary-foreground">Save</button></div></div>;
  const detail = selected && <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-4 mb-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Selected exercise</p><h3 className="font-serif font-bold text-2xl mt-1">{selected.name}</h3><p className="text-sm text-muted-foreground mt-1">Edit the muscle tags or add this movement to a future coach draft.</p></div><button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground"><X className="w-4 h-4" /></button></div><div className="flex flex-wrap gap-1.5 mt-4">{MUSCLE_GROUPS.map(mg => <button key={mg} onClick={() => setSelected({ ...selected, muscleGroups: selected.muscleGroups.includes(mg) ? selected.muscleGroups.filter(x => x !== mg) || ["full_body"] : [...selected.muscleGroups, mg] })} className={`px-2 py-1 rounded-md text-[10px] font-bold border ${selected.muscleGroups.includes(mg) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}>{formatMuscleGroup(mg)}</button>)}</div><div className="flex justify-end gap-2 mt-4"><button onClick={() => { setItems(items.map(item => item.id === selected.id ? selected : item)); setSelected(null); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold">Save exercise</button></div></div>;
  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-card p-4 rounded-2xl border border-border shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><BookOpen className="w-5 h-5" /></div><div><h2 className="font-bold text-lg leading-tight">Exercise Library</h2><p className="text-xs text-muted-foreground">{items.length} canonical exercises</p></div></div><div className="flex gap-2 w-full sm:w-auto"><div className="relative flex-1 sm:w-64"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-sm" /></div><button onClick={() => { setAdding(true); setName(""); }} className="flex items-center justify-center px-4 rounded-xl bg-primary text-primary-foreground"><Plus className="w-5 h-5 mr-1" /><span className="font-bold text-sm">Add</span></button></div></div>
    {adding && form}{detail}
    <div className="space-y-8">{groups.map(g => <div key={g.muscle} className="space-y-3"><h3 className="font-bold text-lg flex items-center gap-2 border-b border-border pb-2">{formatMuscleGroup(g.muscle)}<span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{g.items.length}</span></h3><div className="grid md:grid-cols-2 gap-3">{g.items.map(ex => editing === ex.id ? <div key={ex.id} className="md:col-span-2">{form}</div> : <button key={ex.id} onClick={() => setSelected(ex)} className={`group text-left flex items-center justify-between p-3 bg-card border rounded-xl transition-all hover:border-primary hover:shadow-sm ${selected?.id === ex.id ? "border-primary bg-primary/5" : "border-border"}`}><div><p className="font-bold text-sm">{ex.name}</p>{ex.muscleGroups.length > 1 && <p className="text-xs text-muted-foreground mt-0.5">Also: {ex.muscleGroups.slice(1).map(formatMuscleGroup).join(", ")}</p>}<p className="text-[10px] text-primary font-bold uppercase tracking-wider mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click to edit</p></div><div className="flex gap-1 opacity-0 group-hover:opacity-100"><span onClick={e => { e.stopPropagation(); setEditing(ex.id); setName(ex.name); }} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></span><span onClick={e => { e.stopPropagation(); setItems(items.filter(x => x.id !== ex.id)); }} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></span></div></button>)}</div></div>)}</div>
  </div>;
}

function CreateWorkoutModal({ onClose, onCreate }: { onClose: () => void; onCreate: (w: Workout) => void }) {
  const [tab, setTab] = useState<"manual" | "ai">("manual");
  const [selected, setSelected] = useState(["aj", "emily"]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("2026-03-12");
  const [duration, setDuration] = useState("45");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const toggle = (id: string) => setSelected(selected.includes(id) && selected.length > 1 ? selected.filter(x => x !== id) : selected.includes(id) ? selected : [...selected, id]);
  const log = (d?: Draft) => { const use = d || { title, durationMinutes: Number(duration), notes, exercises: [] }; onCreate({ id: String(Date.now()), title: use.title, workoutDate: date, durationMinutes: use.durationMinutes, notes: use.notes || "Locally logged from canvas preview.", participantIds: selected, participants: MEMBERS.filter(m => selected.includes(m.id)), exercises: use.exercises }); onClose(); };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"><div className={`bg-card w-full rounded-2xl shadow-xl overflow-hidden border border-border flex flex-col ${draft ? "max-w-2xl max-h-[90vh]" : "max-w-md"}`}>
    <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20"><h2 className="font-serif font-bold text-xl flex items-center gap-2"><Activity className="w-5 h-5 text-primary" />Log Workout</h2><button onClick={onClose}><X className="w-5 h-5" /></button></div>
    <div className="flex border-b border-border"><button onClick={() => setTab("manual")} className={`flex-1 py-3 text-sm font-bold border-b-2 ${tab === "manual" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>Manual Entry</button><button onClick={() => setTab("ai")} className={`flex-1 py-3 text-sm font-bold border-b-2 flex justify-center gap-1.5 ${tab === "ai" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}><Sparkles className="w-4 h-4" /> AI Draft</button></div>
    <div className="p-4 overflow-y-auto"><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Logging For</label><div className="flex gap-2 mb-4">{MEMBERS.map(m => <button key={m.id} onClick={() => toggle(m.id)} style={selected.includes(m.id) ? { backgroundColor: m.color } : {}} className={`flex-1 py-2 rounded-xl font-bold text-sm border-2 ${selected.includes(m.id) ? "border-transparent text-white shadow-sm" : "border-border text-muted-foreground"}`}>{m.name}</button>)}</div>
      {tab === "manual" ? <div className="space-y-4"><label className="text-xs font-bold text-muted-foreground uppercase">Workout Title<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Upper Body Power" className="mt-1 w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground font-bold" /></label><div className="grid grid-cols-2 gap-4"><label className="text-xs font-bold text-muted-foreground uppercase">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground" /></label><label className="text-xs font-bold text-muted-foreground uppercase">Duration<input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground" /></label></div><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it feel?" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 min-h-20" /><div className="flex gap-3 pt-2"><button onClick={onClose} className="flex-1 py-3 font-bold rounded-xl border border-border">Cancel</button><button disabled={!title} onClick={() => log()} className="flex-1 py-3 font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-50">Start Workout</button></div></div> : !draft ? <div className="space-y-4"><textarea defaultValue="A 35-minute dumbbell workout AJ and Emily can do together, emphasizing full-body strength." className="w-full bg-background border border-border rounded-xl px-4 py-3 min-h-[120px] text-sm" /><button onClick={() => setDraft(COACH_DRAFT)} className="w-full py-3 font-bold rounded-xl bg-primary text-primary-foreground flex justify-center gap-2"><Sparkles className="w-5 h-5" /> Generate Draft</button></div> : <div className="space-y-4"><EditableDraftWorkout draft={draft} onUpdate={setDraft} /><button onClick={() => log(draft)} className="w-full py-3 font-bold rounded-xl bg-primary text-primary-foreground flex justify-center gap-2"><Activity className="w-5 h-5" /> Log This Workout</button></div>}
    </div>
  </div></div>;
}

export function Current() {
  const [selectedIds, setSelectedIds] = useState(["aj", "emily"]);
  const [activeTab, setActiveTab] = useState<"history" | "plan" | "coach" | "library">("coach");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [workouts, setWorkouts] = useState(START_WORKOUTS);
  const bothSelected = selectedIds.length === MEMBERS.length;
  const single = selectedIds.length === 1 ? MEMBERS.find(p => p.id === selectedIds[0]) : null;
  const visible = workouts.filter(w => w.participantIds.some(id => selectedIds.includes(id)));
  const toggle = (id: string) => setSelectedIds(selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds.filter(x => x !== id) : selectedIds.includes(id) ? selectedIds : [...selectedIds, id]);
  const tabs = [{ id: "history", label: "History", Icon: History }, { id: "plan", label: "Weekly Plan", Icon: Calendar }, { id: "coach", label: "AI Coach", Icon: Sparkles }, { id: "library", label: "Exercise Library", Icon: BookOpen }] as const;
  return <main className="homehub-workouts min-h-screen bg-background px-5 py-8 md:px-10">
    <div className="pb-12 max-w-4xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight">Training</h1><p className="text-muted-foreground mt-1 font-medium">{bothSelected ? "Showing workouts for everyone" : `Showing ${single?.name}'s workouts`}</p></div><button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-bold shadow-md"><Plus className="w-5 h-5" />Log Workout</button></header>
      <div className="flex gap-2">{MEMBERS.map(parent => <button key={parent.id} onClick={() => toggle(parent.id)} style={selectedIds.includes(parent.id) ? { backgroundColor: parent.color } : {}} className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm border-2 ${selectedIds.includes(parent.id) ? "border-transparent text-white shadow-md" : "border-border text-muted-foreground bg-card"}`}><span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${selectedIds.includes(parent.id) ? "bg-white/20" : "text-white"}`} style={!selectedIds.includes(parent.id) ? { backgroundColor: parent.color } : {}}>{parent.name[0]}</span>{parent.name}</button>)}</div>
      <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 border-b border-border pb-3">{tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center justify-center md:justify-start gap-1.5 md:gap-2 px-2 md:px-4 py-2.5 md:py-2 rounded-lg font-bold text-xs sm:text-sm whitespace-nowrap ${activeTab === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground"}`}><tab.Icon className="w-4 h-4 shrink-0" />{tab.label}</button>)}</div>
      <div className="pt-2">
        {activeTab === "history" && <WorkoutHistory workouts={visible} bothSelected={bothSelected} removeWorkout={id => setWorkouts(workouts.filter(w => w.id !== id))} />}
        {activeTab === "plan" && <WorkoutWeeklyPlan onSaved={() => setActiveTab("history")} />}
        {activeTab === "coach" && <WorkoutCoach onLogged={() => setActiveTab("history")} />}
        {activeTab === "library" && <ExerciseLibrary />}
      </div>
    </div>
    {showCreateModal && <CreateWorkoutModal onClose={() => setShowCreateModal(false)} onCreate={w => setWorkouts([w, ...workouts])} />}
  </main>;
}

export default Current;