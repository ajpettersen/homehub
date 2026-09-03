import React, { useState } from "react";
import {
  useGetChores, getGetChoresQueryKey,
  useCompleteChore,
  useCreateChore,
  useDeleteChore,
  useGetProperties, getGetPropertiesQueryKey,
  useGetFamilyMembers, getGetFamilyMembersQueryKey,
} from "@workspace/api-client-react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2, X, Check, Home, RotateCcw } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";

// ── types ─────────────────────────────────────────────────────────────────────

type Frequency = "daily" | "weekly" | "biweekly" | "monthly";
const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily",     label: "Daily" },
  { value: "weekly",    label: "Weekly" },
  { value: "biweekly",  label: "Bi-weekly" },
  { value: "monthly",   label: "Monthly" },
];

// ── chore card ────────────────────────────────────────────────────────────────

function ChoreCard({
  chore,
  onComplete,
  onDelete,
  members,
}: {
  chore: any;
  onComplete: () => void;
  onDelete: () => void;
  members: any[];
}) {
  const isDone = !!chore.completedAt;
  const overdue = !isDone && chore.isOverdue;
  const dueToday = !isDone && chore.dueDate && isToday(parseISO(chore.dueDate));

  const assignee = members.find(m => m.id === chore.assigneeId);

  const urgency = overdue
    ? "border-destructive/40 bg-destructive/5"
    : dueToday
    ? "border-primary/40 bg-primary/5"
    : isDone
    ? "border-border/30 bg-muted/20 opacity-60"
    : "border-border bg-card";

  return (
    <div className={`group flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all ${urgency}`}>
      {/* Complete button */}
      <button
        onClick={onComplete}
        disabled={isDone}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
          isDone
            ? "bg-green-500 border-green-500"
            : overdue
            ? "border-destructive hover:bg-destructive/10"
            : "border-border hover:border-primary"
        }`}
      >
        {isDone && <Check className="w-3.5 h-3.5 text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm leading-snug ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {chore.title}
        </p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground font-medium">
          <span className="capitalize">{chore.frequency}</span>
          {chore.dueDate && (
            <span className={overdue ? "text-destructive font-bold" : dueToday ? "text-primary font-bold" : ""}>
              {overdue ? "Overdue" : dueToday ? "Due today" : `Due ${format(parseISO(chore.dueDate), "MMM d")}`}
            </span>
          )}
          {chore.propertyName && (
            <span className="flex items-center gap-1">
              <Home className="w-3 h-3" />{chore.propertyName}
            </span>
          )}
        </div>
      </div>

      {/* Assignee badge */}
      {assignee && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
          style={{ backgroundColor: assignee.color || "var(--color-primary)" }}
          title={assignee.name}
        >
          {assignee.name.charAt(0)}
        </div>
      )}

      {/* Done badge */}
      {isDone && chore.completedBy && (
        <span className="text-xs text-muted-foreground font-medium hidden sm:block shrink-0">{chore.completedBy}</span>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── add chore form ────────────────────────────────────────────────────────────

function AddChoreForm({
  properties,
  members,
  onSubmit,
  onCancel,
  saving,
}: {
  properties: any[];
  members: any[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle]         = useState("");
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [assigneeId, setAssigneeId] = useState("");

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !propertyId) return;
    onSubmit({ title: title.trim(), propertyId, frequency, assigneeId: assigneeId || null, points: 0 });
  };

  return (
    <form onSubmit={handle} className="bg-card border-2 border-primary/20 rounded-2xl p-5 space-y-4 shadow-md">
      {/* Title */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Task</label>
        <input
          autoFocus
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="e.g. Vacuum main floor"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Property */}
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Property</label>
          <select
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            className="w-full bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
            required
          >
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Assignee */}
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Assigned to</label>
          <select
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            className="w-full bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
          >
            <option value="">Anyone</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {/* Frequency */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Repeats</label>
        <div className="flex gap-2 flex-wrap">
          {FREQUENCIES.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFrequency(f.value)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border-2 ${
                frequency === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 font-bold rounded-xl border-2 border-border text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2">
          <X className="w-4 h-4" /> Cancel
        </button>
        <button type="submit" disabled={saving} className="flex-1 py-2.5 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20 flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> {saving ? "Saving…" : "Add"}
        </button>
      </div>
    </form>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Chores() {
  const queryClient = useQueryClient();
  const { activeMember } = useActiveMember();
  const { preferences } = usePreferences();

  const { data: chores, isLoading } = useGetChores({}, { query: { queryKey: getGetChoresQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });

  const completeChore = useCompleteChore();
  const createChore = useCreateChore();
  const deleteChore = useDeleteChore();

  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine" | "today" | "done">(() => preferences.tabs.chores.defaultFilter);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });

  const handleComplete = (id: string) => {
    completeChore.mutate(
      { id, data: { completedBy: activeMember?.name ?? "Someone" } },
      { onSuccess: invalidate }
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this chore?")) return;
    deleteChore.mutate({ id }, { onSuccess: invalidate });
  };

  const handleCreate = (data: any) => {
    createChore.mutate({ data }, {
      onSuccess: () => { setAdding(false); invalidate(); }
    });
  };

  // Filtering
  const today = new Date().toISOString().split("T")[0];
  const filteredChores = (chores ?? []).filter(c => {
    if (filter === "mine") return c.assigneeId === activeMember?.id;
    if (filter === "today") return c.dueDate === today && !c.completedAt;
    if (filter === "done") return !!c.completedAt;
    if (filter === "all") return !c.completedAt;
    return true;
  });

  // Group by section
  const overdue = filteredChores.filter(c => !c.completedAt && c.isOverdue);
  const dueToday = filteredChores.filter(c => !c.completedAt && !c.isOverdue && c.dueDate === today);
  const upcoming = filteredChores.filter(c => !c.completedAt && !c.isOverdue && c.dueDate !== today);
  const done = filter === "done" ? filteredChores.filter(c => c.completedAt) : [];

  const totalPending = (chores ?? []).filter(c => !c.completedAt).length;
  const totalDueToday = (chores ?? []).filter(c => !c.completedAt && c.dueDate === today).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight">Chores</h1>
          <p className="text-muted-foreground mt-1 font-medium">
            {totalPending > 0 ? `${totalPending} pending · ${totalDueToday} due today` : "All caught up!"}
          </p>
        </div>

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-bold hover:bg-foreground/90 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" /> Add Chore
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <AddChoreForm
          properties={properties ?? []}
          members={(members ?? []).filter(m => m.role !== "pet")}
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
          saving={createChore.isPending}
        />
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {[
          { key: "all",   label: "All" },
          { key: "today", label: "Today" },
          { key: "mine",  label: "Mine" },
          { key: "done",  label: "Done" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${filter === f.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      ) : filteredChores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-3xl bg-card text-center px-4">
          <CheckCircle2 className="w-12 h-12 text-primary/30 mb-3" />
          <p className="font-serif font-bold text-xl mb-1">
            {filter === "done" ? "No completed chores yet" : "All clear!"}
          </p>
          <p className="text-muted-foreground text-sm">
            {filter === "done" ? "Mark chores complete and they'll appear here." : "No chores match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-destructive uppercase tracking-wider mb-3 flex items-center gap-1.5">
                ⚠ Overdue ({overdue.length})
              </h2>
              <div className="space-y-2">
                {overdue.map(c => (
                  <ChoreCard key={c.id} chore={c} members={members ?? []} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c.id)} />
                ))}
              </div>
            </section>
          )}

          {dueToday.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">
                Due Today ({dueToday.length})
              </h2>
              <div className="space-y-2">
                {dueToday.map(c => (
                  <ChoreCard key={c.id} chore={c} members={members ?? []} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c.id)} />
                ))}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-2">
                {upcoming.map(c => (
                  <ChoreCard key={c.id} chore={c} members={members ?? []} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c.id)} />
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Completed ({done.length})
              </h2>
              <div className="space-y-2">
                {done.map(c => (
                  <ChoreCard key={c.id} chore={c} members={members ?? []} onComplete={() => handleComplete(c.id)} onDelete={() => handleDelete(c.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
