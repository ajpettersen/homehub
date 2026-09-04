import React, { useMemo, useState } from "react";
import { Activity, BookOpen, CalendarDays, Check, ChevronDown, Clock3, Dumbbell, History, Plus, Send, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { format } from "date-fns";
import "./_group.css";

type Muscle = "Chest" | "Back" | "Core" | "Glutes" | "Legs" | "Mobility";
type Exercise = { id: string; name: string; muscle: Muscle; sets: number; reps: number; detail: string };
type Draft = { title: string; date: string; duration: number; exercises: Exercise[]; notes: string };
const TODAY = "2026-03-12";
const people = [{ id: "aj", name: "AJ", color: "#C65B3B" }, { id: "emily", name: "Emily", color: "#6F8F62" }];
const base: Exercise[] = [
  { id: "goblet", name: "Goblet squat", muscle: "Legs", sets: 3, reps: 10, detail: "35 lb dumbbell" },
  { id: "press", name: "Dumbbell floor press", muscle: "Chest", sets: 3, reps: 10, detail: "30 lb dumbbells" },
  { id: "row", name: "One-arm dumbbell row", muscle: "Back", sets: 3, reps: 10, detail: "30 lb dumbbell" },
];
const options: Record<Muscle, Exercise[]> = {
  Chest: [{ id: "pushup", name: "Incline push-up", muscle: "Chest", sets: 3, reps: 8, detail: "Kitchen counter height" }, { id: "fly", name: "Dumbbell squeeze press", muscle: "Chest", sets: 3, reps: 12, detail: "Light, controlled tempo" }, { id: "floor", name: "Neutral-grip floor press", muscle: "Chest", sets: 3, reps: 8, detail: "Shoulder-friendly press" }],
  Back: [{ id: "pullover", name: "Dumbbell pullover", muscle: "Back", sets: 3, reps: 10, detail: "Bench or floor" }, { id: "bandrow", name: "Banded row", muscle: "Back", sets: 3, reps: 14, detail: "Anchor at chest height" }, { id: "reverse", name: "Reverse fly", muscle: "Back", sets: 3, reps: 12, detail: "Light dumbbells" }],
  Core: [{ id: "deadbug", name: "Dead bug", muscle: "Core", sets: 3, reps: 8, detail: "Per side, slow exhale" }, { id: "plank", name: "Elevated plank", muscle: "Core", sets: 3, reps: 30, detail: "Seconds, counter height" }, { id: "carry", name: "Suitcase carry", muscle: "Core", sets: 3, reps: 40, detail: "Steps per side" }],
  Glutes: [{ id: "bridge", name: "Weighted glute bridge", muscle: "Glutes", sets: 3, reps: 12, detail: "Dumbbell across hips" }, { id: "hinge", name: "Dumbbell RDL", muscle: "Glutes", sets: 3, reps: 10, detail: "Soft knees, long spine" }, { id: "step", name: "Low step-up", muscle: "Glutes", sets: 3, reps: 8, detail: "Per side, knee-friendly height" }],
  Legs: [{ id: "split", name: "Supported split squat", muscle: "Legs", sets: 3, reps: 8, detail: "Per side, hold chair" }, { id: "wall", name: "Wall sit", muscle: "Legs", sets: 3, reps: 30, detail: "Seconds, pain-free range" }, { id: "calf", name: "Standing calf raise", muscle: "Legs", sets: 3, reps: 14, detail: "Slow on the way down" }],
  Mobility: [{ id: "hips", name: "Hip flexor flow", muscle: "Mobility", sets: 2, reps: 6, detail: "Per side, unhurried" }, { id: "thread", name: "Thread the needle", muscle: "Mobility", sets: 2, reps: 6, detail: "Per side" }, { id: "ankles", name: "Ankle rocks", muscle: "Mobility", sets: 2, reps: 10, detail: "Per side" }],
};
const freshDraft = (): Draft => ({ title: "Couples Dumbbell Circuit", date: "2026-03-16", duration: 35, exercises: base, notes: "Alternate stations, rest 60 seconds between rounds." });

function DraftEditor({ draft, onChange }: { draft: Draft; onChange: (next: Draft) => void }) {
  const [group, setGroup] = useState<Muscle>("Back");
  const [open, setOpen] = useState(true);
  const [replace, setReplace] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Exercise | null>(null);
  const mode = draft.date > TODAY;
  const update = (id: string, key: keyof Exercise, value: string | number) => onChange({ ...draft, exercises: draft.exercises.map(e => e.id === id ? { ...e, [key]: value } : e) });
  const remove = (exercise: Exercise) => { setRemoved(exercise); onChange({ ...draft, exercises: draft.exercises.filter(e => e.id !== exercise.id) }); };
  const add = (exercise: Exercise) => { const copy = { ...exercise, id: `${exercise.id}-${Date.now()}` }; onChange({ ...draft, exercises: replace ? draft.exercises.map(e => e.id === replace ? copy : e) : [...draft.exercises, copy] }); setReplace(null); };
  return <section className="draft-editor" aria-label="Editable workout draft">
    <div className="draft-heading"><div><span className="eyebrow">{mode ? "Planning draft" : "Workout log"}</span><h2>{mode ? "Build the week around real life" : "Capture what you did"}</h2><p>{mode ? `Scheduled for ${format(new Date(`${draft.date}T12:00:00`), "EEEE, MMMM d")} — nothing will be logged yet.` : "Adjust the details before saving this completed session."}</p></div><span className="duration"><Clock3 /> {draft.duration} min</span></div>
    <div className="draft-fields"><label>Workout name<input value={draft.title} onChange={e => onChange({ ...draft, title: e.target.value })} /></label><label>Date<input type="date" value={draft.date} onChange={e => onChange({ ...draft, date: e.target.value })} /></label><label>Minutes<input type="number" min="5" value={draft.duration} onChange={e => onChange({ ...draft, duration: Number(e.target.value) || 0 })} /></label></div>
    {removed && <div className="undo-bar" role="status"><span>{removed.name} removed from this draft.</span><button onClick={() => { onChange({ ...draft, exercises: [...draft.exercises, removed] }); setRemoved(null); }}><Undo2 /> Undo</button></div>}
    <div className="exercise-stack"><div className="section-line"><h3>Session movements</h3><span>{draft.exercises.length} selected</span></div>
      {draft.exercises.length === 0 ? <div className="empty-draft"><Dumbbell /><strong>Your draft is open.</strong><p>Add an intelligent suggestion below, or ask the coach to shape a new session.</p></div> : draft.exercises.map(ex => <article className="exercise-row" key={ex.id}><div className="exercise-mark">{ex.name.slice(0, 1)}</div><div className="exercise-main"><input aria-label={`${ex.name} exercise name`} value={ex.name} onChange={e => update(ex.id, "name", e.target.value)} /><span>{ex.muscle} · {ex.detail}</span></div><label>Sets<input aria-label={`${ex.name} sets`} type="number" value={ex.sets} onChange={e => update(ex.id, "sets", Number(e.target.value))} /></label><label>Reps<input aria-label={`${ex.name} reps`} type="number" value={ex.reps} onChange={e => update(ex.id, "reps", Number(e.target.value))} /></label><button className="replace-button" onClick={() => { setReplace(ex.id); setOpen(true); }} aria-label={`Replace ${ex.name}`}>Replace</button><button className="remove-button" onClick={() => remove(ex)} aria-label={`Remove ${ex.name} from draft`}><Trash2 /></button></article>)}
    </div>
    <div className="idea-drawer"><div className="idea-top"><div><span className="eyebrow">Coach options</span><h3>Find a movement that fits today</h3></div><button className="drawer-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide options" : "Show options"} <ChevronDown /></button></div>
      {open && <><div className="muscles" aria-label="Choose muscle group">{(Object.keys(options) as Muscle[]).map(m => <button key={m} onClick={() => setGroup(m)} className={group === m ? "active" : ""}>{m}</button>)}</div><p className="suggestion-copy">Three practical {group.toLowerCase()} choices, based on your equipment and Emily’s knee-friendly preference.</p><div className="option-list">{options[group].map(option => <div className="option" key={option.id}><div><strong>{option.name}</strong><span>{option.sets} sets · {option.reps} reps · {option.detail}</span></div><div><button onClick={() => add(option)}>{replace ? "Replace" : "Add to draft"}</button><button className="dismiss" onClick={() => setOpen(false)} aria-label={`Dismiss ${option.name}`}>Dismiss</button></div></div>)}</div></>}
    </div>
  </section>;
}

function Coach({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([{ who: "AJ + Emily", copy: "We have 35 minutes Monday. Dumbbells only, and please keep it gentle on Emily’s left knee." }, { who: "HomeHub Coach", copy: "I’ve made a shared strength circuit with alternating stations and a knee-friendly lower-body choice. The draft stays fully editable." }]);
  const [pending, setPending] = useState(false);
  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    const request = text.trim();
    if (!request || pending) return;
    // The user turn is committed synchronously, so the composer always feels instant.
    setMessages(current => [...current, { who: "AJ + Emily", copy: request }]);
    setText("");
    setPending(true);
    window.setTimeout(() => {
      setMessages(current => [...current, { who: "HomeHub Coach", copy: "I updated the editable draft with that in mind. Use Coach options below to tailor any movement further." }]);
      onChange({ ...draft, title: request.toLowerCase().includes("core") ? "Core + Strength Together" : "Custom session for AJ + Emily" });
      setPending(false);
    }, 720);
  };
  return <div className="coach-layout"><section className="chat"><div className="coach-title"><Sparkles /><div><span className="eyebrow">Household coach</span><h2>Plan in plain language</h2></div></div><div className="chat-thread" aria-live="polite">{messages.map((m, i) => <div className={`bubble ${i % 2 ? "coach-bubble" : ""}`} key={`${m.who}-${i}`}><strong>{m.who}</strong><p>{m.copy}</p></div>)}{pending && <div className="bubble coach-bubble typing" role="status" aria-label="HomeHub Coach is generating a response"><strong>HomeHub Coach</strong><p><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span className="sr-only">Generating a response…</span></p></div>}</div><div className="quick-prompts"><button disabled={pending} onClick={() => setText("Make it a 30-minute low-impact session")}>30-minute low impact</button><button disabled={pending} onClick={() => setText("Add extra back and core work")}>More back + core</button></div><form onSubmit={send}><label className="sr-only" htmlFor="coach-request">Tell HomeHub Coach what you need</label><textarea id="coach-request" value={text} disabled={pending} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={pending ? "Coach is shaping your session…" : "Tell the coach what needs to work for your household…"} /><button aria-label={pending ? "Coach is generating" : "Send planning request"} disabled={!text.trim() || pending}><Send /></button><span className="composer-hint">{pending ? "Generating a thoughtful reply…" : "Enter to send · Shift + Enter for a new line"}</span></form></section><DraftEditor draft={draft} onChange={onChange} /></div>;
}

export function Current() {
  const [tab, setTab] = useState<"coach" | "plan" | "history" | "library">("coach");
  const [draft, setDraft] = useState(freshDraft);
  const [saved, setSaved] = useState(false);
  const [peopleSelected, setPeopleSelected] = useState(["aj", "emily"]);
  const isFuture = draft.date > TODAY;
  const nav = [{ id: "coach", label: "Coach", Icon: Sparkles }, { id: "plan", label: "Weekly plan", Icon: CalendarDays }, { id: "history", label: "History", Icon: History }, { id: "library", label: "Exercise library", Icon: BookOpen }] as const;
  const summary = useMemo(() => `${draft.exercises.length} movements · ${draft.duration} minutes`, [draft]);
  return <main className="homehub-workouts"><div className="workout-shell"><header className="topbar"><div><span className="eyebrow">HomeHub / Wellbeing</span><h1>Move together, <em>without the admin.</em></h1><p>A shared place for the workouts that fit AJ and Emily’s actual week.</p></div><div className="date-card"><CalendarDays /><div><span>Next session</span><strong>Mon, Mar 16</strong></div></div></header>
    <div className="people-bar"><span>Planning for</span>{people.map(p => <button key={p.id} onClick={() => setPeopleSelected(peopleSelected.includes(p.id) && peopleSelected.length > 1 ? peopleSelected.filter(id => id !== p.id) : peopleSelected.includes(p.id) ? peopleSelected : [...peopleSelected, p.id])} className={peopleSelected.includes(p.id) ? "person selected" : "person"}><i style={{ background: p.color }}>{p.name[0]}</i>{p.name}<Check /></button>)}</div>
    <nav aria-label="Workout sections">{nav.map(item => <button className={tab === item.id ? "selected-tab" : ""} onClick={() => setTab(item.id)} key={item.id}><item.Icon />{item.label}</button>)}</nav>
    {tab === "coach" || tab === "plan" ? <><Coach draft={draft} onChange={setDraft} /><footer className="action-footer"><div><span className="eyebrow">{isFuture ? "Planning mode" : "Logging mode"}</span><strong>{isFuture ? "This stays on your shared schedule." : "This will become a completed workout."}</strong><small>{summary}</small></div><button onClick={() => setSaved(true)}>{isFuture ? <CalendarDays /> : <Activity />}{isFuture ? "Add to weekly schedule" : "Log workout"}</button></footer>{saved && <div className="saved-note" role="status"><Check /> {isFuture ? "Scheduled for AJ and Emily. You can revise it any time." : "Workout logged to your shared history."}<button onClick={() => setSaved(false)} aria-label="Dismiss confirmation"><X /></button></div>}</> : tab === "history" ? <section className="simple-panel"><History /><h2>Shared history</h2><p>Last Thursday · Full Body Strength · AJ + Emily · 48 minutes</p><p>Sunday · Morning Run + Mobility · Emily · 38 minutes</p></section> : <section className="simple-panel"><BookOpen /><h2>Exercise library</h2><p>12 household-friendly movements, organized around equipment you already own.</p><button onClick={() => setTab("coach")}>Use the coach to build a draft</button></section>}
  </div></main>;
}
export default Current;