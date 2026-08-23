import React, { useState } from "react";
import {
  useGetMaintenanceTasks, getGetMaintenanceTasksQueryKey,
  useCompleteMaintenanceTask,
  useCreateMaintenanceTask,
  useUpdateMaintenanceTask,
  useDeleteMaintenanceTask,
  useGetProperties, getGetPropertiesQueryKey,
  useGetFamilyMembers, getGetFamilyMembersQueryKey,
} from "@workspace/api-client-react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Clock, AlertTriangle, Plus, Trash2, X, Check,
  TreePine, Home, CalendarDays, Repeat, Wrench, Droplets,
  Leaf, Filter, ChevronDown, ChevronUp
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

// ── category config ────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "seasonal",  label: "Seasonal",  Icon: CalendarDays, color: "text-orange-500" },
  { key: "appliance", label: "Appliance", Icon: Wrench,       color: "text-blue-500" },
  { key: "water",     label: "Water",     Icon: Droplets,     color: "text-cyan-500" },
  { key: "filter",    label: "Filter",    Icon: Filter,       color: "text-purple-500" },
  { key: "yard",      label: "Yard",      Icon: Leaf,         color: "text-green-500" },
  { key: "cleaning",  label: "Cleaning",  Icon: Home,         color: "text-primary" },
  { key: "other",     label: "Other",     Icon: Wrench,       color: "text-muted-foreground" },
];

function getCategoryConfig(key: string) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

// ── task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  members,
  onComplete,
  onDelete,
  onAssign,
}: {
  task: any;
  members: any[];
  onComplete: () => void;
  onDelete: () => void;
  onAssign: (assigneeId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = getCategoryConfig(task.category);
  const CatIcon = cat.Icon;

  const daysUntil = differenceInDays(parseISO(task.nextDueDate), new Date());
  const overdue = task.isOverdue;
  const dueSoon = task.isDueSoon && !overdue;

  const urgencyBorder = overdue
    ? "border-destructive/40"
    : dueSoon
    ? "border-amber-400/60"
    : "border-border/60";

  const dueBadge = overdue
    ? <span className="text-xs font-bold text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Overdue</span>
    : dueSoon
    ? <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><Clock className="w-3 h-3" />Due in {daysUntil}d</span>
    : <span className="text-xs text-muted-foreground font-medium">Due {format(parseISO(task.nextDueDate), "MMM d")}</span>;

  return (
    <div className={`bg-card rounded-2xl border-2 ${urgencyBorder} overflow-hidden transition-all`}>
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 ${cat.color}`}>
          <CatIcon className="w-4.5 h-4.5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground leading-snug">{task.title}</p>
          <div className="flex items-center gap-3 mt-1">
            {dueBadge}
            <span className="text-xs text-muted-foreground">
              {task.scheduleType === "one-time" ? "One-time task" : `Every ${task.frequencyDays}d`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {task.assigneeName && (
            <span
              title={`Assigned to ${task.assigneeName}`}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
              style={{ backgroundColor: task.assigneeColor ?? "hsl(15 70% 50%)" }}
              data-testid={`avatar-assignee-${task.id}`}
            >
              {task.assigneeName.charAt(0).toUpperCase()}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onComplete(); }}
            className="w-8 h-8 flex items-center justify-center bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg transition-all"
            title="Mark done"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 bg-muted/20 space-y-3">
          <div className="flex items-start justify-between gap-3">
            {task.description ? (
              <p className="text-sm text-foreground/80 leading-relaxed flex-1">{task.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic flex-1">No notes.</p>
            )}
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Assign to</p>
            <div className="flex gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onAssign(null)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                  !task.assigneeId
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40"
                }`}
              >
                Anyone
              </button>
              {members.map(m => {
                const active = task.assigneeId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => onAssign(m.id)}
                    data-testid={`button-assign-${task.id}-${m.id}`}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                      active ? "text-white border-transparent shadow-sm" : "border-border text-muted-foreground hover:border-foreground/40"
                    }`}
                    style={active ? { backgroundColor: m.color } : undefined}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({
  properties,
  members,
  onSubmit,
  onCancel,
  saving,
  defaultPropertyId,
}: {
  properties: any[];
  members: any[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  defaultPropertyId?: string;
}) {
  const [title, setTitle] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? properties[0]?.id ?? "");
  const [category, setCategory] = useState("other");
  const [assigneeId, setAssigneeId] = useState("");
  const [scheduleType, setScheduleType] = useState<"recurring" | "one-time">("recurring");
  const [freqDays, setFreqDays] = useState("30");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !propertyId) return;
    const today = new Date().toISOString().split("T")[0];
    onSubmit({
      title: title.trim(),
      description: description || null,
      propertyId,
      category,
      assigneeId: assigneeId || null,
      scheduleType,
      frequencyDays: scheduleType === "recurring" ? parseInt(freqDays) || 30 : undefined,
      startDate: scheduleType === "recurring" ? startDate || null : null,
      nextDueDate: scheduleType === "one-time" ? dueDate : startDate || today,
    });
  };

  return (
    <form onSubmit={handle} className="bg-card border-2 border-primary/20 rounded-2xl p-5 space-y-4 shadow-md">
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Task Name</label>
        <input
          autoFocus
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary"
          placeholder="e.g. Pump septic tank"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Property</label>
          <select
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            className="w-full bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
          >
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
          >
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Assign to</label>
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setAssigneeId("")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
              !assigneeId ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/40"
            }`}
          >
            Anyone
          </button>
          {members.map(m => {
            const active = assigneeId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setAssigneeId(m.id)}
                data-testid={`button-form-assign-${m.id}`}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                  active ? "text-white border-transparent shadow-sm" : "border-border text-muted-foreground hover:border-foreground/40"
                }`}
                style={active ? { backgroundColor: m.color } : undefined}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Schedule</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "recurring", label: "Repeat" },
            { value: "one-time", label: "One time" },
          ].map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScheduleType(option.value as "recurring" | "one-time")}
              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                scheduleType === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            {scheduleType === "recurring" ? "Repeat every (days)" : "Due date"}
          </label>
          {scheduleType === "recurring" ? (
          <input
            type="number"
            min="1"
            value={freqDays}
            onChange={e => setFreqDays(e.target.value)}
            className="w-full bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
          />
          ) : (
            <input
              type="date"
              required
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
            />
          )}
        </div>
        {scheduleType === "recurring" && (
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Anchor date (optional)</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Notes (optional)</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
          placeholder="Any details…"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 font-bold rounded-xl border-2 border-border hover:bg-muted transition-colors flex items-center justify-center gap-2">
          <X className="w-4 h-4" /> Cancel
        </button>
        <button type="submit" disabled={saving} className="flex-1 py-2.5 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-md shadow-primary/20 flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> {saving ? "Saving…" : "Add Task"}
        </button>
      </div>
    </form>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Properties() {
  const queryClient = useQueryClient();
  const { activeMember } = useActiveMember();

  const { data: tasks, isLoading } = useGetMaintenanceTasks({}, { query: { queryKey: getGetMaintenanceTasksQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });

  const completeTask = useCompleteMaintenanceTask();
  const createTask = useCreateMaintenanceTask();
  const updateTask = useUpdateMaintenanceTask();
  const deleteTask = useDeleteMaintenanceTask();

  const house = properties?.find(p => p.type === "house");
  const cabin = properties?.find(p => p.type === "cabin");

  const [activeProperty, setActiveProperty] = useState<"house" | "cabin">("cabin");
  const [adding, setAdding] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });

  const handleComplete = (id: string) => {
    completeTask.mutate(
      { id, data: { completedBy: activeMember?.name ?? "Someone" } },
      { onSuccess: invalidate }
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this task?")) return;
    deleteTask.mutate({ id }, { onSuccess: invalidate });
  };

  const handleCreate = (data: any) => {
    createTask.mutate({ data }, {
      onSuccess: () => { setAdding(false); invalidate(); }
    });
  };

  const handleAssign = (id: string, assigneeId: string | null) => {
    updateTask.mutate({ id, data: { assigneeId } }, { onSuccess: invalidate });
  };

  const currentProperty = activeProperty === "cabin" ? cabin : house;

  const propertyTasks = (tasks ?? []).filter(t => t.propertyId === currentProperty?.id);

  const filteredTasks = categoryFilter === "all"
    ? propertyTasks
    : propertyTasks.filter(t => t.category === categoryFilter);

  const overdue = filteredTasks.filter(t => t.isOverdue);
  const dueSoon = filteredTasks.filter(t => t.isDueSoon && !t.isOverdue);
  const upcoming = filteredTasks.filter(t => !t.isOverdue && !t.isDueSoon);

  const usedCategories = [...new Set(propertyTasks.map(t => t.category))];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight">Properties</h1>
          <p className="text-muted-foreground mt-1 font-medium">Maintenance schedules for your properties</p>
        </div>

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-bold hover:bg-foreground/90 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" /> Add Task
          </button>
        )}
      </div>

      {/* Property tabs */}
      <div className="flex gap-2">
        {[
          { key: "cabin",  label: "🏕 Cabin",      prop: cabin },
          { key: "house",  label: "🏠 Main House",  prop: house },
        ].map(({ key, label, prop }) => {
          const propTasks = (tasks ?? []).filter(t => t.propertyId === prop?.id);
          const urgent = propTasks.filter(t => t.isOverdue || t.isDueSoon).length;
          return (
            <button
              key={key}
              onClick={() => { setActiveProperty(key as any); setCategoryFilter("all"); setAdding(false); }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                activeProperty === key
                  ? "bg-card border-primary/40 text-foreground shadow-md"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              {label}
              {urgent > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                  {urgent}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Add form */}
      {adding && (
        <AddTaskForm
          properties={properties ?? []}
          members={members ?? []}
          defaultPropertyId={currentProperty?.id}
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
          saving={createTask.isPending}
        />
      )}

      {/* Category filter chips */}
      {usedCategories.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${categoryFilter === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/40"}`}
          >
            All
          </button>
          {usedCategories.map(cat => {
            const config = getCategoryConfig(cat);
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border capitalize ${categoryFilter === cat ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/40"}`}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tasks */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border rounded-3xl bg-card text-center px-4">
          <TreePine className="w-12 h-12 text-primary/30 mb-3" />
          <p className="font-serif font-bold text-xl mb-1">No tasks yet</p>
          <p className="text-muted-foreground text-sm">Add your first maintenance task for {currentProperty?.name ?? "this property"}.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-destructive uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Overdue ({overdue.length})
              </h2>
              <div className="space-y-2">
                {overdue.map(t => <TaskCard key={t.id} task={t} members={members ?? []} onComplete={() => handleComplete(t.id)} onDelete={() => handleDelete(t.id)} onAssign={(a) => handleAssign(t.id, a)} />)}
              </div>
            </section>
          )}

          {dueSoon.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Coming Up ({dueSoon.length})
              </h2>
              <div className="space-y-2">
                {dueSoon.map(t => <TaskCard key={t.id} task={t} members={members ?? []} onComplete={() => handleComplete(t.id)} onDelete={() => handleDelete(t.id)} onAssign={(a) => handleAssign(t.id, a)} />)}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Scheduled ({upcoming.length})
              </h2>
              <div className="space-y-2">
                {upcoming.map(t => <TaskCard key={t.id} task={t} members={members ?? []} onComplete={() => handleComplete(t.id)} onDelete={() => handleDelete(t.id)} onAssign={(a) => handleAssign(t.id, a)} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
