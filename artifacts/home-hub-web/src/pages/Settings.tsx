import React, { useState, useEffect, useCallback } from "react";
import {
  useGetFamilyMembers, useCreateFamilyMember, useUpdateFamilyMember, useDeleteFamilyMember,
  useGetProperties, useCreateProperty, useUpdateProperty,
  useGetMaintenanceTasks, getGetMaintenanceTasksQueryKey,
  useCreateMaintenanceTask, useUpdateMaintenanceTask, useDeleteMaintenanceTask,
  getGetFamilyMembersQueryKey, getGetPropertiesQueryKey,
  useGetMe, getGetMeQueryKey, useUpdateHouseholdTabVisibility,
   useListUsers, getListUsersQueryKey, useUpdateUserProfile,
   useListHouseholdJoinRequests, getListHouseholdJoinRequestsQueryKey, useDecideHouseholdJoinRequest,
  type HomeHubWebTab,
  type CreateMaintenanceTaskInputCategory,
  type UpdateMaintenanceTaskInputCategory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Home, Users, Plus, Pencil, Trash2, X, Check, MapPin, Image, Mountain,
  CalendarDays, Wrench, Droplets, Filter, Leaf, Repeat, ChevronDown,
  ClipboardList, Brain, Sparkles, Bell, BellOff, Smartphone,
   SlidersHorizontal, UserCog,
} from "lucide-react";
import { usePreferences } from "@/context/PreferencesContext";
import {
  disableWebPush,
  enableWebPush,
  getCurrentWebPushSubscription,
  isStandaloneWebApp,
  supportsWebPush,
} from "@/lib/webPush";

// ── colour palette ───────────────────────────────────────────────────────────
const COLORS = [
  "#C1440E","#2D6A4F","#E07B39","#4A90D9","#9B59B6",
  "#E74C3C","#2ECC71","#F39C12","#1ABC9C","#E91E8C","#607D8B","#795548",
];
const ROLES = ["parent", "child", "pet"] as const;
const MANUAL_MEMBER_ROLES = ["child", "pet"] as const;
type Role = typeof ROLES[number];

const CATEGORIES = [
  { key: "seasonal",  label: "Seasonal",  Icon: CalendarDays, color: "text-orange-500",  bg: "bg-orange-50" },
  { key: "appliance", label: "Appliance", Icon: Wrench,       color: "text-blue-500",    bg: "bg-blue-50" },
  { key: "water",     label: "Water",     Icon: Droplets,     color: "text-cyan-500",    bg: "bg-cyan-50" },
  { key: "filter",    label: "Filter",    Icon: Filter,       color: "text-purple-500",  bg: "bg-purple-50" },
  { key: "yard",      label: "Yard",      Icon: Leaf,         color: "text-green-500",   bg: "bg-green-50" },
  { key: "cleaning",  label: "Cleaning",  Icon: Home,         color: "text-primary",     bg: "bg-primary/5" },
  { key: "other",     label: "Other",     Icon: Wrench,       color: "text-muted-foreground", bg: "bg-muted" },
] as const;

function getCat(key: string) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

interface MemberFormState { name: string; role: Role; color: string; photoUrl: string; }
interface PropertyFormState { name: string; address: string; }
interface NewPropertyFormState extends PropertyFormState { type: "house" | "cabin"; }
interface TaskFormState {
  title: string;
  category: string;
  scheduleType: "recurring" | "one-time";
  frequencyDays: number;
  dueDate: string;
  description: string;
  assigneeId: string; // "" = anyone
}
const defaultTaskForm = (): TaskFormState => ({
  title: "",
  category: "other",
  scheduleType: "recurring",
  frequencyDays: 30,
  dueDate: new Date().toISOString().split("T")[0],
  description: "",
  assigneeId: "",
});

// ── Accordion section wrapper ─────────────────────────────────────────────────
function AccordionSection({
  icon, title, summary, defaultOpen = true, children, action,
}: {
  icon: React.ReactNode;
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
      <div className="flex items-center hover:bg-muted/30 transition-colors">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3.5 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-base text-foreground">{title}</span>
            {summary && !open && (
              <div className="mt-0.5">{summary}</div>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {action && <div className="pr-5" onClick={() => setOpen(true)}>{action}</div>}
      </div>

      {open && (
        <div className="border-t border-border px-5 py-5">
          {children}
        </div>
      )}
    </section>
  );
}

// ── ColorPicker ───────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 transition-transform ${value === c ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
          style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

function PreferenceChoice({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/60 p-3.5 flex flex-col justify-between">
      <div className="mb-2.5">
        <label className="text-sm font-bold text-foreground block" htmlFor={`pref-${label.replace(/\s+/g, '-')}`}>{label}</label>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="relative mt-auto">
        <select
          id={`pref-${label.replace(/\s+/g, '-')}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" />
      </div>
    </div>
  );
}

function AppearanceAndTabsSection() {
  const { preferences, setAppearance, setTabPreference, resetPreferences } = usePreferences();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const updateVisibility = useUpdateHouseholdTabVisibility();
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const tab = preferences.tabs;
  const canAdministerHousehold = me?.role === "family" && me.isAdmin;
  const visibleTabs = new Set<HomeHubWebTab>(me?.visibleTabs ?? ["home", "properties", "chores", "meals", "tasks", "workouts", "people", "settings"]);
  const optionalTabs: Array<{ key: HomeHubWebTab; label: string; description: string }> = [
    { key: "properties", label: "Properties", description: "Maintenance schedules and home upkeep." },
    { key: "chores", label: "Chores", description: "Recurring household responsibilities." },
    { key: "meals", label: "Meals", description: "Meal plans, groceries, and recipes." },
    { key: "tasks", label: "Tasks", description: "Shared household lists and projects." },
    { key: "workouts", label: "Workouts", description: "Family exercise plans and progress." },
    { key: "people", label: "People", description: "Family and trusted service contacts." },
  ];

  const toggleTab = async (tabKey: HomeHubWebTab) => {
    const next = new Set(visibleTabs);
    if (next.has(tabKey)) next.delete(tabKey);
    else next.add(tabKey);
    setVisibilityError(null);
    try {
      await updateVisibility.mutateAsync({ data: { visibleTabs: Array.from(next) } });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (error) {
      setVisibilityError(error instanceof Error ? error.message : "Could not update visible tabs.");
    }
  };

  return (
    <AccordionSection
      icon={<SlidersHorizontal className="h-4 w-4" />}
      title="Appearance & tabs"
      summary={<span className="text-xs text-muted-foreground">Customize UI and tab visibility</span>}
      defaultOpen={false}
      action={
        <button
          type="button"
          onClick={resetPreferences}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          data-testid="button-reset-preferences"
        >
          Reset
        </button>
      }
    >
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Overall look</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <PreferenceChoice
              label="Color mode"
              description="Choose the light or dark colors used across the app."
              value={preferences.appearance.colorMode}
              options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
              onChange={value => setAppearance("colorMode", value as "light" | "dark")}
            />
            <PreferenceChoice
              label="UI density"
              description="Use comfortable spacing or fit more information on screen."
              value={preferences.appearance.density}
              options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
              onChange={value => setAppearance("density", value as "comfortable" | "compact")}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Tabs your household uses</p>
          <p className="mb-3 text-sm text-muted-foreground">
            Hidden tabs disappear from navigation on every device. Home and Settings always remain available.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {optionalTabs.map(item => {
              const enabled = visibleTabs.has(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={enabled}
                  disabled={updateVisibility.isPending || !canAdministerHousehold}
                  onClick={() => void toggleTab(item.key)}
                  className={`flex items-center justify-between gap-4 rounded-xl border p-3.5 text-left transition-colors ${
                    enabled ? "border-primary/40 bg-primary/5" : "border-border bg-background/60"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span>
                    <span className="block text-sm font-bold text-foreground">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                  </span>
                </button>
              );
            })}
          </div>
          {!canAdministerHousehold && (
            <p className="mt-3 text-xs text-muted-foreground">Only a household administrator can change household-wide tabs.</p>
          )}
          {visibilityError && <p className="mt-3 text-sm font-medium text-destructive">{visibilityError}</p>}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Customize each tab</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <PreferenceChoice
              label="Home"
              description="Choose whether your assistant or today’s household overview leads the page."
              value={tab.home.focus}
              options={[{ value: "overview", label: "Overview first" }, { value: "assistant", label: "Assistant first" }]}
              onChange={value => setTabPreference("home", "focus", value as "overview" | "assistant")}
            />
            <PreferenceChoice
              label="Chores"
              description="Pick the filter shown automatically whenever you open Chores."
              value={tab.chores.defaultFilter}
              options={[
                { value: "all", label: "All pending" }, { value: "today", label: "Due today" },
                { value: "mine", label: "Mine" }, { value: "done", label: "Completed" },
              ]}
              onChange={value => setTabPreference("chores", "defaultFilter", value as "all" | "today" | "mine" | "done")}
            />
            <PreferenceChoice
              label="Meals"
              description="Open the meal planner, shopping list, or cookbook by default."
              value={tab.meals.defaultView}
              options={[
                { value: "meals", label: "Meal plan" }, { value: "shopping", label: "Shopping list" }, { value: "recipes", label: "Cookbook" },
              ]}
              onChange={value => setTabPreference("meals", "defaultView", value as "meals" | "shopping" | "recipes")}
            />
            <PreferenceChoice
              label="Tasks"
              description="Show task lists in two columns or one focused list per row."
              value={tab.tasks.layout}
              options={[{ value: "columns", label: "Two columns" }, { value: "list", label: "Single list" }]}
              onChange={value => setTabPreference("tasks", "layout", value as "columns" | "list")}
            />
            <PreferenceChoice
              label="Workouts"
              description="Start with everyone’s workouts or the person currently active in the household."
              value={tab.workouts.defaultScope}
              options={[{ value: "everyone", label: "Everyone" }, { value: "active", label: "Active member" }]}
              onChange={value => setTabPreference("workouts", "defaultScope", value as "everyone" | "active")}
            />
            <PreferenceChoice
              label="People"
              description="Use roomy profile cards or a compact directory when browsing people."
              value={tab.people.layout}
              options={[{ value: "cards", label: "Profile cards" }, { value: "compact", label: "Compact directory" }]}
              onChange={value => setTabPreference("people", "layout", value as "cards" | "compact")}
            />
            <PreferenceChoice
              label="Settings"
              description="Choose the section opened first when you return to Settings."
              value={tab.settings.startSection}
              options={[
                { value: "members", label: "Members" }, { value: "properties", label: "Properties" },
                { value: "notifications", label: "Notifications" }, { value: "memory", label: "AI memory" },
              ]}
              onChange={value => setTabPreference("settings", "startSection", value as "members" | "properties" | "notifications" | "memory")}
            />
          </div>
        </div>
      </div>
    </AccordionSection>
  );
}

// ── TaskForm ──────────────────────────────────────────────────────────────────
function TaskForm({ initial, members, onSave, onCancel, saving }: {
  initial: TaskFormState; members: any[]; onSave: (d: TaskFormState) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState<TaskFormState>(initial);
  const set = <K extends keyof TaskFormState>(k: K, v: TaskFormState[K]) => setForm(f => ({ ...f, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); if (form.title.trim()) onSave({ ...form, title: form.title.trim() }); }}
      className="bg-muted/40 border border-border rounded-xl p-4 space-y-3 mt-2">
      <input
        autoFocus required value={form.title}
        onChange={e => set("title", e.target.value)}
        placeholder="Task title…"
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-primary"
      />
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <button key={cat.key} type="button" onClick={() => set("category", cat.key)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
              form.category === cat.key
                ? `${cat.bg} ${cat.color} border-current`
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}>
            <cat.Icon className="w-3 h-3" /> {cat.label}
          </button>
        ))}
      </div>
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Schedule</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "recurring", label: "Repeat" },
            { value: "one-time", label: "One time" },
          ].map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => set("scheduleType", option.value as TaskFormState["scheduleType"])}
              className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                form.scheduleType === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {form.scheduleType === "recurring" ? (
          <>
            <Repeat className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Every</span>
            <input type="number" min={1} max={3650} value={form.frequencyDays}
              onChange={e => set("frequencyDays", Number(e.target.value))}
              className="w-16 bg-background border border-border rounded-lg px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">days</span>
          </>
        ) : (
          <>
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Due</span>
            <input
              type="date"
              required
              value={form.dueDate}
              onChange={e => set("dueDate", e.target.value)}
              className="bg-background border border-border rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:border-primary"
            />
          </>
        )}
      </div>
      <div>
        <label htmlFor="task-assignee" className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Assign to</label>
        <div className="relative">
          <select
            id="task-assignee"
            value={form.assigneeId}
            onChange={e => set("assigneeId", e.target.value)}
            data-testid="select-settings-assign"
            className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          >
            <option value="">Anyone</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" />
        </div>
      </div>
      <textarea value={form.description} onChange={e => set("description", e.target.value)}
        placeholder="Notes (optional)…" rows={2}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground focus:outline-none focus:border-primary resize-none"
      />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg border border-border text-sm font-bold hover:bg-muted transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? "Saving…" : "Save Task"}
        </button>
      </div>
    </form>
  );
}

// ── PropertyTasksSection ──────────────────────────────────────────────────────
function PropertyTasksSection({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useGetMaintenanceTasks(
    { propertyId },
    { query: { queryKey: getGetMaintenanceTasksQueryKey({ propertyId }) } }
  );
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const createTask = useCreateMaintenanceTask();
  const updateTask = useUpdateMaintenanceTask();
  const deleteTask = useDeleteMaintenanceTask();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey({ propertyId }) });

  const handleAdd = (data: TaskFormState) => {
    createTask.mutate(
      {
        data: {
          title: data.title,
          category: data.category as CreateMaintenanceTaskInputCategory,
          scheduleType: data.scheduleType,
          frequencyDays: data.scheduleType === "recurring" ? data.frequencyDays : undefined,
          description: data.description || undefined,
          propertyId,
          assigneeId: data.assigneeId || null,
          nextDueDate: data.dueDate,
        },
      },
      { onSuccess: () => { invalidate(); setAdding(false); } }
    );
  };

  const handleEdit = (id: string, data: TaskFormState) => {
    updateTask.mutate(
      {
        id,
        data: {
          title: data.title,
          category: data.category as UpdateMaintenanceTaskInputCategory,
          scheduleType: data.scheduleType,
          frequencyDays: data.scheduleType === "recurring" ? data.frequencyDays : undefined,
          nextDueDate: data.dueDate,
          description: data.description || undefined,
          assigneeId: data.assigneeId || null,
        },
      },
      { onSuccess: () => { invalidate(); setEditingId(null); } }
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    deleteTask.mutate({ id }, { onSuccess: invalidate });
  };

  if (isLoading) {
    return <div className="py-4 flex gap-2 flex-col">{[1,2,3].map(i => <div key={i} className="h-9 bg-muted animate-pulse rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-1.5">
      {tasks?.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground py-2 text-center">No tasks yet — add one below.</p>
      )}

      {tasks?.map(task => {
        const cat = getCat(task.category);
        if (editingId === task.id) {
          return (
            <TaskForm
              key={task.id}
              members={members ?? []}
              initial={{
                title: task.title,
                category: task.category,
                scheduleType: task.scheduleType ?? "recurring",
                frequencyDays: task.frequencyDays ?? 30,
                dueDate: task.nextDueDate,
                description: task.description ?? "",
                assigneeId: task.assigneeId ?? "",
              }}
              onSave={data => handleEdit(task.id, data)}
              onCancel={() => setEditingId(null)}
              saving={updateTask.isPending}
            />
          );
        }
        return (
          <div key={task.id}
            className="group flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${cat.bg}`}>
              <cat.Icon className={`w-3 h-3 ${cat.color}`} />
            </div>
            <span className="text-sm font-medium flex-1 min-w-0 truncate">{task.title}</span>
            {task.assigneeName && (
              <span
                title={`Assigned to ${task.assigneeName}`}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ backgroundColor: task.assigneeColor ?? "#C1440E" }}
              >
                {task.assigneeName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
              {task.scheduleType === "one-time" ? (
                <><CalendarDays className="w-3 h-3" /> One time</>
              ) : (
                <><Repeat className="w-3 h-3" /> {task.frequencyDays}d</>
              )}
            </span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
              <button onClick={() => setEditingId(task.id)}
                className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
              <button onClick={() => handleDelete(task.id, task.title)}
                className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}

      {adding ? (
        <TaskForm
          members={members ?? []}
          initial={defaultTaskForm()}
          onSave={handleAdd}
          onCancel={() => setAdding(false)}
          saving={createTask.isPending}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground text-xs font-medium transition-all group">
          <Plus className="w-3.5 h-3.5 text-primary/60 group-hover:text-primary" />
          Add task
        </button>
      )}
    </div>
  );
}

// ── PropertyRow — compact accordion row for one property ─────────────────────
function NewPropertyForm({ onSave, onCancel, saving }: {
  onSave: (data: NewPropertyFormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<NewPropertyFormState>({ name: "", address: "", type: "cabin" });

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (form.name.trim()) onSave({ ...form, name: form.name.trim() });
      }}
      className="space-y-3 rounded-xl border-2 border-primary/20 bg-muted/30 p-4"
    >
      <div className="grid grid-cols-2 gap-2">
        {([
          { type: "house", label: "House", Icon: Home },
          { type: "cabin", label: "Cabin", Icon: Mountain },
        ] as const).map(({ type, label, Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => setForm(current => ({ ...current, type }))}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
              form.type === type
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/40"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <input
        autoFocus
        required
        value={form.name}
        onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
        placeholder={form.type === "cabin" ? "Cabin name" : "Property name"}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none"
      />
      <input
        value={form.address}
        onChange={event => setForm(current => ({ ...current, address: event.target.value }))}
        placeholder="Address (optional)"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border py-2 text-sm font-bold hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Adding…" : `Add ${form.type === "cabin" ? "Cabin" : "House"}`}
        </button>
      </div>
    </form>
  );
}

function PropertyRow({ property, onSaveInfo, saving, canAdminister, isDefault }: {
  property: any; onSaveInfo: (data: PropertyFormState) => void; saving: boolean; canAdminister: boolean; isDefault: boolean;
}) {
  const baseUrl = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const streetViewSrc = `${baseUrl}/api/properties/${property.id}/streetview`;
  const [imgError, setImgError] = useState(false);
  const isCabin = property.type === "cabin";
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState<PropertyFormState>({ name: property.name, address: property.address ?? "" });
  const [tasksOpen, setTasksOpen] = useState(false);

  const handleSave = (e: React.FormEvent) => { e.preventDefault(); onSaveInfo(infoForm); setEditingInfo(false); };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Property header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-muted">
          {property.address && !imgError ? (
            <img src={streetViewSrc} alt={property.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {isCabin ? <Mountain className="w-5 h-5 text-muted-foreground/40" /> : <Home className="w-5 h-5 text-muted-foreground/40" />}
            </div>
          )}
        </div>

        {editingInfo && canAdminister ? (
          <form onSubmit={handleSave} className="flex-1 flex flex-col gap-2">
            <div className="flex gap-2">
              <input autoFocus required value={infoForm.name}
                onChange={e => setInfoForm(f => ({ ...f, name: e.target.value }))}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 font-bold text-sm focus:outline-none focus:border-primary"
                placeholder="Property name" />
              <input value={infoForm.address}
                onChange={e => setInfoForm(f => ({ ...f, address: e.target.value }))}
                className="flex-[2] bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                placeholder="123 Main St, City, ST" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditingInfo(false)}
                className="px-3 py-1 rounded-lg border border-border text-xs font-bold hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{property.name}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground capitalize">{property.type}</span>
              {isDefault && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Default</span>}
            </div>
            {property.address ? (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 shrink-0" />{property.address}
              </p>
            ) : canAdminister ? (
              <button onClick={() => setEditingInfo(true)} className="text-xs text-primary/60 hover:text-primary mt-0.5 flex items-center gap-1 transition-colors">
                <MapPin className="w-3 h-3 shrink-0" /> Add address…
              </button>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">No address added</p>
            )}
          </div>
        )}

        {!editingInfo && canAdminister && (
          <button onClick={() => setEditingInfo(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-foreground hover:border-primary/50 hover:text-primary transition-colors shrink-0">
            <Pencil className="w-3.5 h-3.5" />
            Edit settings
          </button>
        )}
      </div>

      {/* Tasks accordion */}
      <button type="button" onClick={() => setTasksOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-border hover:bg-muted/30 transition-colors text-sm">
        <span className="flex items-center gap-2 font-semibold text-foreground/70">
          <ClipboardList className="w-3.5 h-3.5 text-primary/50" />
          Maintenance Tasks
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${tasksOpen ? "rotate-180" : ""}`} />
      </button>

      {tasksOpen && (
        <div className="px-3 pb-3 border-t border-border/50 pt-1">
          <PropertyTasksSection propertyId={property.id} />
        </div>
      )}
    </div>
  );
}

// ── MemberForm ────────────────────────────────────────────────────────────────
function MemberForm({ initial, onSave, onCancel, saving, lockAdultRole = false }: {
  initial: MemberFormState; onSave: (d: MemberFormState) => void; onCancel: () => void; saving: boolean; lockAdultRole?: boolean;
}) {
  const [form, setForm] = useState<MemberFormState>(initial);
  const set = (k: keyof MemberFormState, v: string) => setForm(f => ({ ...f, [k]: v }));
  const roleOptions = lockAdultRole ? (["parent"] as const) : initial.role === "parent" ? ROLES : MANUAL_MEMBER_ROLES;

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }}
      className="space-y-4 bg-card border-2 border-primary/20 rounded-2xl p-5 shadow-md">
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Name</label>
        <input autoFocus required value={form.name} onChange={e => set("name", e.target.value)}
          className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary"
          placeholder="e.g. Alex" />
      </div>
      <div>
        <label htmlFor="member-role" className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Role</label>
        <div className="relative">
          <select
            id="member-role"
            value={form.role}
            onChange={e => set("role", e.target.value as Role)}
            className="w-full appearance-none rounded-xl border-2 border-border bg-background px-4 py-2.5 text-sm font-bold capitalize text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {roleOptions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" />
        </div>
        {lockAdultRole && <p className="mt-1.5 text-xs text-muted-foreground">This adult’s role is protected while their approved account is active.</p>}
      </div>
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Color</label>
        <ColorPicker value={form.color} onChange={c => set("color", c)} />
      </div>
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block flex items-center gap-1.5">
          <Image className="w-3.5 h-3.5" /> Photo URL <span className="font-normal normal-case text-muted-foreground">(optional)</span>
        </label>
        <input value={form.photoUrl} onChange={e => set("photoUrl", e.target.value)}
          className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
          placeholder="https://…" />
        {form.photoUrl && (
          <div className="mt-2 flex items-center gap-3">
            <img src={form.photoUrl} alt="Preview" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              className="w-12 h-12 rounded-full object-cover border-2 border-border" />
            <span className="text-xs text-muted-foreground">Preview</span>
          </div>
        )}
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 font-bold rounded-xl border-2 border-border text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2">
          <X className="w-4 h-4" /> Cancel
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20 flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// ── MemberCard ────────────────────────────────────────────────────────────────
function MemberCard({ member, onEdit, onDelete, canAdminister }: { member: any; onEdit: () => void; onDelete: () => void; canAdminister: boolean }) {
  return (
    <Card className="group relative overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-center gap-3.5">
        {member.photoUrl ? (
          <img src={member.photoUrl} alt={member.name}
            className="w-11 h-11 rounded-full object-cover shrink-0 border-2 border-border"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner shrink-0"
            style={{ backgroundColor: member.color || "var(--color-primary)" }}>
            {member.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base leading-tight truncate">{member.name}</h3>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">{member.role}</p>
          {member.role === "parent" && (
            <p className={`mt-1 text-xs font-semibold ${member.hasLinkedAccount ? "text-green-700" : "text-amber-700"}`}>
              {member.hasLinkedAccount ? "Account linked" : "Legacy adult · account not linked"}
            </p>
          )}
        </div>
        {canAdminister && <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>}
      </CardContent>
    </Card>
  );
}

// ── AiMemorySection ───────────────────────────────────────────────────────────
interface Memory { id: number; content: string; category: string; source?: string | null; createdAt: string; }

function memorySourceLabel(source?: string | null): string | null {
  if (source === "meals") return "from meal ratings";
  if (source === "chat") return "from chat";
  if (source === "auto") return "automatically learned";
  return null;
}

function AiMemorySection() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/memories");
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    await fetch(`/api/ai/memories/${id}`, { method: "DELETE" });
    setMemories(prev => prev.filter(m => m.id !== id));
    setDeletingId(null);
  };

  if (loading) return (
    <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded-xl" />)}</div>
  );

  if (memories.length === 0) return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/8 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-primary/50" />
      </div>
      <div>
        <p className="font-semibold text-sm text-foreground">Nothing remembered yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          The AI assistant learns your preferences as you chat. Try telling it about workout styles, food preferences, or household routines.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        These facts are injected into every AI response — meal plans, workout suggestions, and the chat assistant all use them automatically.
      </p>
      {memories.map(m => (
        <div key={m.id} className="group flex items-start gap-3 px-3.5 py-3 rounded-xl bg-primary/5 border border-primary/10 hover:border-primary/20 transition-colors">
          <Brain className="w-3.5 h-3.5 text-primary/60 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-snug">{m.content}</p>
            {memorySourceLabel(m.source) && (
              <p className="text-[10px] text-muted-foreground mt-1">{memorySourceLabel(m.source)}</p>
            )}
          </div>
          <button
            onClick={() => handleDelete(m.id)}
            disabled={deletingId === m.id}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0 disabled:opacity-40"
            title="Forget this">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function WebNotificationsSection() {
  const supported = supportsWebPush();
  const standalone = isStandaloneWebApp();
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) {
      setChecking(false);
      return;
    }
    getCurrentWebPushSubscription()
      .then(subscription => setEnabled(Notification.permission === "granted" && subscription !== null))
      .catch(() => setEnabled(false))
      .finally(() => setChecking(false));
  }, [supported]);

  const handleToggle = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (enabled) {
        await disableWebPush();
        setEnabled(false);
        setMessage("Notifications are off on this phone.");
      } else {
        await enableWebPush();
        setEnabled(true);
        setMessage("Notifications are on for this phone.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update notifications.");
    } finally {
      setSaving(false);
    }
  };

  if (!supported) {
    return (
      <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground" data-testid="status-web-push-unsupported">
        This browser does not support Home Screen push notifications. On iPhone, use iOS 16.4 or newer and open HomeHub from its Home Screen icon.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
          <Smartphone className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {standalone ? "Home Screen app detected" : "Save HomeHub to your Home Screen"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {standalone
              ? "HomeHub can alert this phone about chores and maintenance even when the app is closed."
              : "For the best phone experience—especially on iPhone—use Share → Add to Home Screen, open that HomeHub icon, then turn notifications on here."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={checking || saving}
        data-testid="button-toggle-web-notifications"
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${
          enabled
            ? "border border-border bg-muted text-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        {enabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {saving ? "Saving…" : enabled ? "Turn off notifications" : "Turn on notifications"}
      </button>
      <p
        className={`text-xs ${enabled ? "text-green-700" : "text-muted-foreground"}`}
        data-testid="status-web-notifications"
      >
        {message ?? (checking ? "Checking this phone…" : enabled ? "Notifications are on for this phone." : "Notifications are off for this phone.")}
      </p>
    </div>
  );
}

function AccountsAndAccessSection({ familyMembers }: { familyMembers: any[] }) {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: accounts } = useListUsers({
    query: {
      queryKey: getListUsersQueryKey(),
      enabled: me?.role === "family" && me.isAdmin,
      refetchOnWindowFocus: true,
    },
  });
  const { data: joinRequests, isLoading: joinRequestsLoading } = useListHouseholdJoinRequests({
    query: {
      queryKey: getListHouseholdJoinRequestsQueryKey(),
      enabled: me?.role === "family" && me.isAdmin,
      refetchOnWindowFocus: true,
    },
  });
  const updateAccount = useUpdateUserProfile();
  const decideJoinRequest = useDecideHouseholdJoinRequest();
  const [memberLinks, setMemberLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (me?.role !== "family" || !me.isAdmin) return null;

  const save = async (
    clerkId: string,
    data: { role?: "family" | "cleaner" | "pending"; linkedFamilyMemberId?: string | null },
  ) => {
    setError(null);
    try {
      await updateAccount.mutateAsync({ clerkId, data });
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch {
      setError("Could not update this account. Please try again.");
    }
  };

  const pending = joinRequests ?? [];
  const active = accounts?.filter(account => account.role !== "pending") ?? [];
  const accountLabel = (clerkId: string) =>
    clerkId === me.clerkId ? "Your account" : `Household account •••${clerkId.slice(-4)}`;

  return (
    <AccordionSection
      icon={<UserCog className="h-4 w-4" />}
      title="Accounts & Access"
      summary={<span className="text-xs text-muted-foreground">{pending.length} pending request{pending.length === 1 ? "" : "s"}</span>}
      defaultOpen={pending.length > 0}
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pending join requests</h3>
          <p className="mt-1 text-xs text-muted-foreground">Approve only accounts you recognize. Account emails are never shown here.</p>
          <div className="mt-3 space-y-3">
            {joinRequestsLoading && <div className="h-20 animate-pulse rounded-xl bg-muted" />}
            {!joinRequestsLoading && pending.length === 0 && (
              <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">No one is waiting for approval.</p>
            )}
            {pending.map(request => {
              const selectedMember = memberLinks[request.id] ?? "";
              return (
                <div key={request.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <p className="text-sm font-bold text-foreground">{request.requesterDisplayName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{request.requesterEmail} · Requested {new Date(request.createdAt).toLocaleDateString()}</p>
                  <label className="mt-3 block text-xs font-bold text-muted-foreground">
                    Link to a family member (optional)
                    <div className="relative mt-1.5">
                      <select
                        value={selectedMember}
                        onChange={event => setMemberLinks(current => ({ ...current, [request.id]: event.target.value }))}
                        className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                      >
                        <option value="">Create a new adult member automatically</option>
                        {familyMembers
                          .filter(member => member.role === "parent" && !member.hasLinkedAccount)
                          .map(member => <option key={member.id} value={member.id}>Link legacy adult: {member.name}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" />
                    </div>
                  </label>
                  <button
                    type="button"
                    disabled={decideJoinRequest.isPending}
                    onClick={() => void (async () => {
                      setError(null);
                      try {
                        await decideJoinRequest.mutateAsync({ requestId: request.id, data: { decision: "approved", linkedFamilyMemberId: selectedMember || null } });
                        await Promise.all([
                          queryClient.invalidateQueries({ queryKey: getListHouseholdJoinRequestsQueryKey() }),
                          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }),
                          queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() }),
                        ]);
                      } catch { setError("Could not decide this join request. Please try again."); }
                    })()}
                    className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {decideJoinRequest.isPending ? "Saving…" : "Approve as family member"}
                  </button>
                  <button
                    type="button"
                    disabled={decideJoinRequest.isPending}
                    onClick={() => void (async () => {
                      setError(null);
                      try {
                        await decideJoinRequest.mutateAsync({ requestId: request.id, data: { decision: "denied" } });
                        await queryClient.invalidateQueries({ queryKey: getListHouseholdJoinRequestsQueryKey() });
                      } catch { setError("Could not decide this join request. Please try again."); }
                    })()}
                    className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted disabled:opacity-60"
                  >
                    Deny request
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Existing accounts</h3>
          <div className="mt-3 divide-y divide-border rounded-xl border border-border">
            {active.map(account => {
              const isSelf = account.clerkId === me.clerkId;
              return (
                <div key={account.clerkId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{accountLabel(account.clerkId)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {account.isAdmin ? "Household administrator" : "Household member"}
                      {account.linkedFamilyMemberName ? ` · Linked to ${account.linkedFamilyMemberName}` : " · Not linked to a family member"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                  {account.role === "family" && account.linkedFamilyMemberId ? (
                    <p className="text-xs font-bold text-green-700">Family account · adult linked</p>
                  ) : account.role === "family" ? (
                    <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      Role
                      <select
                        value="family"
                        disabled={isSelf || updateAccount.isPending}
                        title={isSelf ? "You cannot demote your own active administrator account" : undefined}
                        onChange={event => { if (event.target.value === "cleaner") void save(account.clerkId, { role: "cleaner" }); }}
                        className="rounded-lg border border-border bg-background py-1.5 pl-3 pr-8 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="family">Family</option>
                        <option value="cleaner">Cleaner</option>
                      </select>
                    </label>
                  ) : (
                    <p className="text-xs font-semibold text-muted-foreground">Cleaner account — promotion requires an adult link below.</p>
                  )}
                  {account.role === "family" && !account.linkedFamilyMemberId && (
                    <label className="text-xs font-bold text-amber-700">
                      Link required
                      <select
                        defaultValue=""
                        disabled={updateAccount.isPending}
                        onChange={event => {
                          if (!event.target.value) return;
                          void save(account.clerkId, { linkedFamilyMemberId: event.target.value }).then(() =>
                            queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() }),
                          );
                        }}
                        className="mt-1 block w-full rounded-lg border border-amber-300 bg-background px-3 py-1.5 text-sm text-foreground"
                      >
                        <option value="">Choose an unlinked legacy adult…</option>
                        {familyMembers
                          .filter(member => member.role === "parent" && !member.hasLinkedAccount)
                          .map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                      </select>
                    </label>
                  )}
                  {account.role !== "family" && (
                    <label className="text-xs font-bold text-muted-foreground">
                      Promote to family with legacy adult
                      <select
                        value={memberLinks[account.clerkId] ?? ""}
                        disabled={updateAccount.isPending}
                        onChange={event => setMemberLinks(current => ({ ...current, [account.clerkId]: event.target.value }))}
                        className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                      >
                        <option value="">Choose an unlinked legacy adult…</option>
                        {familyMembers.filter(member => member.role === "parent" && !member.hasLinkedAccount)
                          .map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={!memberLinks[account.clerkId] || updateAccount.isPending}
                        onClick={() => void save(account.clerkId, {
                          role: "family",
                          linkedFamilyMemberId: memberLinks[account.clerkId],
                        }).then(() => queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() }))}
                        className="mt-2 w-full rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
                      >
                        Promote and link adult
                      </button>
                    </label>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      </div>
    </AccordionSection>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function Settings() {
  const queryClient = useQueryClient();
  const { preferences, setTabPreference } = usePreferences();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const canAdministerHousehold = me?.role === "family" && me.isAdmin;

  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });

  const createMember = useCreateFamilyMember();
  const updateMember = useUpdateFamilyMember();
  const deleteMember = useDeleteFamilyMember();
  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();

  const [addingMember, setAddingMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [addingProperty, setAddingProperty] = useState(false);

  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });
  const invalidateProps = () => queryClient.invalidateQueries({ queryKey: getGetPropertiesQueryKey() });

  const memberSummary = familyMembers && familyMembers.length > 0 ? (
    <div className="flex items-center gap-1.5 mt-1">
      {familyMembers.slice(0, 6).map(m => (
        m.photoUrl ? (
          <img key={m.id} src={m.photoUrl} alt={m.name} className="w-6 h-6 rounded-full object-cover border border-border" />
        ) : (
          <div key={m.id} className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border border-white/20 shrink-0"
            style={{ backgroundColor: m.color || "var(--color-primary)" }}>
            {m.name.charAt(0)}
          </div>
        )
      ))}
      <span className="text-xs text-muted-foreground ml-1">{familyMembers.length} member{familyMembers.length !== 1 ? "s" : ""}</span>
    </div>
  ) : null;
  const defaultPropertyId = properties?.some(property => property.id === preferences.tabs.properties.defaultProperty)
    ? preferences.tabs.properties.defaultProperty
    : (properties?.find(property => property.type === preferences.tabs.properties.defaultProperty)?.id ?? properties?.[0]?.id);

  return (
    <div className="space-y-4 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Page header */}
      <div className="pb-1">
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 font-medium">Manage your household, properties, and AI preferences.</p>
      </div>

      <AppearanceAndTabsSection />

      <AccountsAndAccessSection familyMembers={familyMembers ?? []} />

      {/* ── Family Members (person-first: leads the page) ───────────────────── */}
      <AccordionSection
        icon={<Users className="w-4 h-4" />}
        title="Family Members"
        summary={memberSummary}
        defaultOpen={preferences.tabs.settings.startSection === "members"}
        action={
          canAdministerHousehold && !addingMember ? (
            <button onClick={() => { setAddingMember(true); setEditingMemberId(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          ) : undefined
        }
      >
        {canAdministerHousehold && addingMember && (
          <div className="mb-5">
            <MemberForm initial={{ name: "", role: "child", color: COLORS[0], photoUrl: "" }}
              onSave={data => createMember.mutate({ data: { name: data.name, role: data.role as "child" | "pet", color: data.color, photoUrl: data.photoUrl || null } },
                { onSuccess: () => { invalidateMembers(); setAddingMember(false); } })}
              onCancel={() => setAddingMember(false)} saving={createMember.isPending} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {familyMembers?.map(member =>
            canAdministerHousehold && editingMemberId === member.id ? (
              <div key={member.id} className="sm:col-span-2 md:col-span-3">
                <MemberForm
                  initial={{ name: member.name, role: member.role as Role, color: member.color, photoUrl: member.photoUrl ?? "" }}
                  lockAdultRole={member.role === "parent" && member.hasLinkedAccount}
                  onSave={data => updateMember.mutate({ id: member.id, data: { name: data.name, role: data.role, color: data.color, photoUrl: data.photoUrl || null } },
                    { onSuccess: () => { invalidateMembers(); setEditingMemberId(null); } })}
                  onCancel={() => setEditingMemberId(null)} saving={updateMember.isPending} />
              </div>
            ) : (
              <MemberCard key={member.id} member={member}
                canAdminister={canAdministerHousehold}
                onEdit={() => { setEditingMemberId(member.id); setAddingMember(false); }}
                onDelete={() => { if (confirm(`Remove ${member.name}?`)) deleteMember.mutate({ id: member.id }, { onSuccess: invalidateMembers }); }} />
            )
          )}
        </div>

        {canAdministerHousehold && !addingMember && (
          <button onClick={() => { setAddingMember(true); setEditingMemberId(null); }}
            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground text-sm font-medium transition-all">
            <Plus className="w-4 h-4 text-primary/60" /> Add family member
          </button>
        )}
      </AccordionSection>

      {/* ── Properties ──────────────────────────────────────────────────────── */}
      <AccordionSection
        icon={<Home className="w-4 h-4" />}
        title="Properties"
        summary={<span className="text-xs text-muted-foreground">{properties?.length ?? 0} propert{properties?.length === 1 ? "y" : "ies"}</span>}
        defaultOpen={preferences.tabs.settings.startSection === "properties"}
        action={
          canAdministerHousehold && !addingProperty ? (
            <button
              onClick={() => setAddingProperty(true)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Add Property
            </button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {properties && properties.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <label htmlFor="default-property" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Default maintenance property</label>
              <p className="mb-2 mt-0.5 text-xs text-muted-foreground">This property opens first on the maintenance page.</p>
              <select
                id="default-property"
                value={defaultPropertyId ?? ""}
                onChange={event => setTabPreference("properties", "defaultProperty", event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold focus:border-primary focus:outline-none"
              >
                {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </div>
          )}
          {canAdministerHousehold && addingProperty && (
            <NewPropertyForm
              onSave={data => createProperty.mutate(
                {
                  data: {
                    name: data.name,
                    type: data.type,
                    icon: data.type === "cabin" ? "mountain" : "home",
                    address: data.address || null,
                  },
                },
                {
                  onSuccess: () => {
                    invalidateProps();
                    setAddingProperty(false);
                  },
                },
              )}
              onCancel={() => setAddingProperty(false)}
              saving={createProperty.isPending}
            />
          )}
          {properties?.map(property => (
            <PropertyRow
              key={property.id}
              property={property}
              isDefault={property.id === defaultPropertyId}
              canAdminister={canAdministerHousehold}
              onSaveInfo={data => updateProperty.mutate({ id: property.id, data: { name: data.name, address: data.address || null } }, { onSuccess: invalidateProps })}
              saving={updateProperty.isPending}
            />
          ))}
          {canAdministerHousehold && !addingProperty && (
            <button
              onClick={() => setAddingProperty(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-muted/30"
            >
              <Plus className="h-4 w-4 text-primary/60" /> Add property
            </button>
          )}
        </div>
      </AccordionSection>

      <AccordionSection
        icon={<Bell className="w-4 h-4" />}
        title="Phone Notifications"
        summary={<span className="text-xs text-muted-foreground">Chore and maintenance reminders on this phone</span>}
        defaultOpen={preferences.tabs.settings.startSection === "notifications"}
      >
        <WebNotificationsSection />
      </AccordionSection>

      {/* ── AI Memory ───────────────────────────────────────────────────────── */}
      <AccordionSection
        icon={<Brain className="w-4 h-4" />}
        title="AI Memory"
        summary={<span className="text-xs text-muted-foreground">What the assistant has learned about your family</span>}
        defaultOpen={preferences.tabs.settings.startSection === "memory"}
      >
        <AiMemorySection />
      </AccordionSection>
    </div>
  );
}
