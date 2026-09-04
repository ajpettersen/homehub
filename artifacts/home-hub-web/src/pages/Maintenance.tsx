import React, { useEffect, useState } from "react";
import {
  useGetMaintenanceTasks, getGetMaintenanceTasksQueryKey,
  useCompleteMaintenanceTask,
  useCreateMaintenanceTask,
  useUpdateMaintenanceTask,
  useDeleteMaintenanceTask,
  useGetProperties, getGetPropertiesQueryKey,
  useGetFamilyMembers, getGetFamilyMembersQueryKey,
  getGetDashboardQueryKey,
  useRecommendMaintenance,
  type CreateMaintenanceTaskInputCategory,
  type MaintenanceRecommendation,
} from "@workspace/api-client-react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Clock, AlertTriangle, Plus, Trash2, X, Check,
  TreePine, Home, CalendarDays, Repeat, Wrench, Droplets,
  Leaf, Filter, ChevronDown, ChevronUp, Sparkles, Loader2
} from "lucide-react";
import { addDays, format, parseISO, differenceInDays } from "date-fns";
import { getLocalDateOnly, getResolvedTimeZone } from "@/lib/dateOnly";

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
  onDueDateChange,
  updatingDueDate,
}: {
  task: any;
  members: any[];
  onComplete: () => void;
  onDelete: () => void;
  onAssign: (assigneeId: string | null) => void;
  onDueDateChange: (nextDueDate: string) => void;
  updatingDueDate: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dueDate, setDueDate] = useState(task.nextDueDate);
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
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              setExpanded(current => !current);
            }}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${task.title}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
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

          <div onClick={e => e.stopPropagation()}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Next due date</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dueDate}
                disabled={updatingDueDate}
                aria-label={`Next due date for ${task.title}`}
                onChange={event => {
                  const nextDueDate = event.target.value;
                  setDueDate(nextDueDate);
                  if (nextDueDate) onDueDateChange(nextDueDate);
                }}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:border-primary disabled:opacity-50"
              />
              <button
                type="button"
                disabled={updatingDueDate}
                onClick={() => {
                  const nextDueDate = getLocalDateOnly(addDays(new Date(), 1));
                  setDueDate(nextDueDate);
                  onDueDateChange(nextDueDate);
                }}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:border-primary disabled:opacity-50"
              >
                Tomorrow
              </button>
              <button
                type="button"
                disabled={updatingDueDate}
                onClick={() => {
                  const nextDueDate = getLocalDateOnly(addDays(new Date(), 7));
                  setDueDate(nextDueDate);
                  onDueDateChange(nextDueDate);
                }}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:border-primary disabled:opacity-50"
              >
                Next week
              </button>
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
    const today = getLocalDateOnly();
    onSubmit({
      title: title.trim(),
      description: description || null,
      propertyId,
      category,
      assigneeId: assigneeId || null,
      scheduleType,
      frequencyDays: scheduleType === "recurring" ? parseInt(freqDays) || 30 : undefined,
      startDate: scheduleType === "recurring" ? startDate || null : null,
      nextDueDate: scheduleType === "one-time" ? dueDate : today,
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

export type EditableMaintenanceRecommendation = MaintenanceRecommendation & {
  canonicalKey: string;
  selected: boolean;
  title: string;
  frequencyDays: number;
};

export interface MaintenanceSuggestionsProps {
  property: any;
  timezone: string;
  onClose: () => void;
  onCreated: () => Promise<unknown>;
}

export function MaintenanceSuggestions({
  property,
  timezone,
  onClose,
  onCreated,
}: MaintenanceSuggestionsProps) {
  const recommend = useRecommendMaintenance();
  const createTask = useCreateMaintenanceTask();
  const [items, setItems] = useState<EditableMaintenanceRecommendation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    recommend.mutate(
      { data: { propertyId: property.id } },
      {
        onSuccess: data => setItems(data.recommendations.map(item => ({
          ...item,
          selected: true,
          frequencyDays: item.defaultFrequencyDays,
        }))),
      },
    );
  }, [property.id]);

  const selected = items.filter(item => item.selected && Number.isInteger(item.frequencyDays) && item.frequencyDays > 0 && item.frequencyDays <= 3650);
  const addSelected = async () => {
    if (submitting || selected.length === 0) return;
    const submission = selected.map(item => ({ ...item }));
    setSubmitting(true);
    setResult(null);
    try {
      const today = getLocalDateOnly();
      const results = await Promise.allSettled(submission.map(item => createTask.mutateAsync({
        data: {
          title: item.title,
          description: item.description ?? null,
          propertyId: property.id,
          category: item.category as CreateMaintenanceTaskInputCategory,
          scheduleType: "recurring",
          frequencyDays: item.frequencyDays,
          startDate: today,
          timezone,
          canonicalKey: item.canonicalKey,
        },
      })));
      const added = results.filter(item => item.status === "fulfilled").length;
      const failed = results.length - added;
      if (added > 0) await onCreated();
      const successfulTitles = new Set(submission.filter((_, index) => results[index]?.status === "fulfilled").map(item => item.title));
      // Remove only the snapshot items that succeeded. Failed snapshot items
      // stay intact for an explicit retry; unrelated live selections remain.
      setItems(current => current.filter(item => !successfulTitles.has(item.title)));
      const rejected = results.find((item): item is PromiseRejectedResult => item.status === "rejected");
      setResult(failed === 0
        ? `${added} maintenance task${added === 1 ? "" : "s"} added successfully.`
        : `${added} added; ${failed} could not be added. ${rejected?.reason instanceof Error ? rejected.reason.message : "The remaining items are ready to retry."}`);
    } catch {
      setResult("The selected tasks could not be added. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="maintenance-suggestions-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 id="maintenance-suggestions-title" className="font-serif text-2xl font-bold">Suggested maintenance</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose recurring tasks for {property.name} and adjust how often they repeat.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close suggestions" className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {recommend.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Creating practical ideas…</div>
          ) : recommend.isError ? (
            <div className="py-12 text-center">
              <p className="font-bold text-destructive">Suggestions could not be loaded.</p>
              <button type="button" disabled={submitting} onClick={() => recommend.mutate({ data: { propertyId: property.id } }, { onSuccess: data => setItems(data.recommendations.map(item => ({ ...item, selected: true, frequencyDays: item.defaultFrequencyDays }))) })} className="mt-3 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50">Try again</button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{result ?? "No new maintenance ideas were found. Your current tasks may already cover the essentials."}</p>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => {
                const category = getCategoryConfig(item.category);
                return (
                  <div key={`${item.title}-${index}`} className={`rounded-xl border p-4 transition-colors ${item.selected ? "border-primary/40 bg-primary/5" : "border-border opacity-70"}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" disabled={submitting} checked={item.selected} aria-label={`Select ${item.title}`} onChange={event => setItems(current => current.map((value, i) => i === index ? { ...value, selected: event.target.checked } : value))} className="mt-1 h-4 w-4 accent-primary disabled:cursor-not-allowed" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            aria-label={`Title for ${item.title}`}
                            disabled={submitting}
                            value={item.title}
                            onChange={event => setItems(current => current.map((value, i) => i === index ? { ...value, title: event.target.value } : value))}
                            className="min-w-0 flex-1 bg-transparent font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{category.label}</span>
                        </div>
                        {item.description && <p className="mt-1 text-sm text-foreground/80">{item.description}</p>}
                        <p className="mt-1.5 text-xs text-muted-foreground">{item.reason}</p>
                        {item.selected && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <label htmlFor={`frequency-${index}`} className="text-xs font-bold">Repeat every</label>
                            <input id={`frequency-${index}`} disabled={submitting} type="number" min={1} max={3650} value={item.frequencyDays} onChange={event => setItems(current => current.map((value, i) => i === index ? { ...value, frequencyDays: Number(event.target.value) } : value))} className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-bold disabled:cursor-not-allowed" />
                            <span className="text-xs text-muted-foreground">days</span>
                            {[30, 90, 180, 365].map(days => <button key={days} disabled={submitting} type="button" onClick={() => setItems(current => current.map((value, i) => i === index ? { ...value, frequencyDays: days } : value))} className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold hover:border-primary disabled:cursor-not-allowed">{days === 365 ? "Yearly" : days === 180 ? "6 months" : days === 90 ? "3 months" : "Monthly"}</button>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {result && items.length > 0 && <p className="mt-4 rounded-xl bg-muted p-3 text-sm font-medium" role="status">{result}</p>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border p-5">
          <span className="text-sm text-muted-foreground">{selected.length} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50">Close</button>
            <button type="button" onClick={addSelected} disabled={submitting || selected.length === 0} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? "Adding…" : "Add selected tasks"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Properties() {
  const queryClient = useQueryClient();
  const { activeMember } = useActiveMember();
  const { preferences } = usePreferences();
  const timezone = getResolvedTimeZone();
  const maintenanceQuery = { timezone };

  const { data: tasks, isLoading } = useGetMaintenanceTasks(maintenanceQuery, { query: { queryKey: getGetMaintenanceTasksQueryKey(maintenanceQuery) } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });

  const completeTask = useCompleteMaintenanceTask();
  const createTask = useCreateMaintenanceTask();
  const updateTask = useUpdateMaintenanceTask();
  const deleteTask = useDeleteMaintenanceTask();

  const [activePropertyId, setActivePropertyId] = useState(() => preferences.tabs.properties.defaultProperty);
  const [adding, setAdding] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [updatingDueDateId, setUpdatingDueDateId] = useState<string | null>(null);

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey(maintenanceQuery) }),
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
  ]);

  const handleComplete = (id: string) => {
    completeTask.mutate(
      { id, data: { completedBy: activeMember?.name ?? "Someone", completedOn: getLocalDateOnly(), timezone } },
      { onSuccess: invalidate }
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this task?")) return;
    deleteTask.mutate({ id }, { onSuccess: invalidate });
  };

  const handleCreate = (data: any) => {
    createTask.mutate({ data: { ...data, ...(data.scheduleType === "recurring" && { timezone }) } }, {
      onSuccess: () => { setAdding(false); invalidate(); }
    });
  };

  const handleAssign = (id: string, assigneeId: string | null) => {
    const task = tasks?.find(candidate => candidate.id === id);
    updateTask.mutate(
      {
        id,
        data: {
          assigneeId,
          ...(task?.scheduleType === "recurring" && { timezone }),
        },
      },
      { onSuccess: invalidate },
    );
  };

  const handleDueDateChange = (task: any, nextDueDate: string) => {
    setUpdatingDueDateId(task.id);
    updateTask.mutate(
      {
        id: task.id,
        data: {
          nextDueDate,
          ...(task.scheduleType === "recurring" && { timezone }),
        },
      },
      {
        onSuccess: invalidate,
        onSettled: () => setUpdatingDueDateId(null),
      },
    );
  };

  const currentProperty = properties?.find(property => property.id === activePropertyId)
    ?? properties?.find(property => property.type === activePropertyId)
    ?? properties?.[0];

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

        <div className="flex flex-wrap gap-2">
          {currentProperty && <button onClick={() => setSuggesting(true)} className="flex items-center gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-2.5 font-bold text-primary hover:bg-primary/10"><Sparkles className="h-5 w-5" /> Suggest maintenance</button>}
          {!adding && <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-bold hover:bg-foreground/90 transition-colors shadow-md"><Plus className="w-5 h-5" /> Add Task</button>}
        </div>
      </div>

      {/* Property tabs */}
      <div className="flex gap-2">
        {(properties ?? []).map(prop => {
          const key = prop.id;
          const label = prop.name;
          const propTasks = (tasks ?? []).filter(t => t.propertyId === prop?.id);
          const urgent = propTasks.filter(t => t.isOverdue || t.isDueSoon).length;
          return (
            <button
              key={key}
              onClick={() => { setActivePropertyId(key); setCategoryFilter("all"); setAdding(false); }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                currentProperty?.id === key
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

      {suggesting && currentProperty && <MaintenanceSuggestions property={currentProperty} timezone={timezone} onClose={() => setSuggesting(false)} onCreated={invalidate} />}

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
                {overdue.map(t => <TaskCard key={t.id} task={t} members={members ?? []} onComplete={() => handleComplete(t.id)} onDelete={() => handleDelete(t.id)} onAssign={(a) => handleAssign(t.id, a)} onDueDateChange={(date) => handleDueDateChange(t, date)} updatingDueDate={updatingDueDateId === t.id} />)}
              </div>
            </section>
          )}

          {dueSoon.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Coming Up ({dueSoon.length})
              </h2>
              <div className="space-y-2">
                {dueSoon.map(t => <TaskCard key={t.id} task={t} members={members ?? []} onComplete={() => handleComplete(t.id)} onDelete={() => handleDelete(t.id)} onAssign={(a) => handleAssign(t.id, a)} onDueDateChange={(date) => handleDueDateChange(t, date)} updatingDueDate={updatingDueDateId === t.id} />)}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Scheduled ({upcoming.length})
              </h2>
              <div className="space-y-2">
                {upcoming.map(t => <TaskCard key={t.id} task={t} members={members ?? []} onComplete={() => handleComplete(t.id)} onDelete={() => handleDelete(t.id)} onAssign={(a) => handleAssign(t.id, a)} onDueDateChange={(date) => handleDueDateChange(t, date)} updatingDueDate={updatingDueDateId === t.id} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
