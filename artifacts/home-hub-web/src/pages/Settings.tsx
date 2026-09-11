import React, { useState, useEffect, useCallback, useId } from "react";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import {
  useGetFamilyMembers, useCreateFamilyMember, useUpdateFamilyMember, useDeleteFamilyMember,
  useGetProperties, useCreateProperty, useUpdateProperty, useDeleteProperty,
  useGetMaintenanceTasks, getGetMaintenanceTasksQueryKey,
  useCreateMaintenanceTask, useUpdateMaintenanceTask, useDeleteMaintenanceTask,
  getGetFamilyMembersQueryKey, getGetPropertiesQueryKey,
  useGetMe, getGetMeQueryKey, useUpdateHouseholdTabVisibility,
  useListUsers, getListUsersQueryKey, useUpdateUserProfile,
  useListHouseholdJoinRequests, getListHouseholdJoinRequestsQueryKey, useDecideHouseholdJoinRequest,
  useListHouseholdInvites, getListHouseholdInvitesQueryKey, useCreateHouseholdInvite, useRevokeHouseholdInvite,
  useMergeDuplicateAdult, useGetNotificationPreferences, useUpdateNotificationPreferences,
  getGetNotificationPreferencesQueryKey,
  type HomeHubWebTab,
  type CreateMaintenanceTaskInputCategory,
  type UpdateMaintenanceTaskInputCategory,
  useGetStores,
  getGetStoresQueryKey,
  useCreateStore,
  useUpdateStore,
  useDeleteStore,
  type HouseholdStore,
  type StoreInput,
  type StoreInputDepartmentsItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Home, Users, Plus, Pencil, Trash2, X, Check, MapPin, Image, Mountain,
  CalendarDays, Wrench, Droplets, Filter, Leaf, Repeat, ChevronDown,
  ClipboardList, Brain, Sparkles, Bell, BellOff, Smartphone,
  SlidersHorizontal, UserCog, Merge, AlertTriangle, Link as LinkIcon, Copy, Loader2, Store, ChevronUp
} from "lucide-react";
import { usePreferences } from "@/context/PreferencesContext";
import {
  disableWebPush,
  enableWebPush,
  getCurrentWebPushSubscription,
  isStandaloneWebApp,
  supportsWebPush,
} from "@/lib/webPush";

import { YourProfile } from "@/components/settings/YourProfile";
import { MaintenanceSuggestions } from "@/pages/Maintenance";
import { getLocalDateOnly, getResolvedTimeZone } from "@/lib/dateOnly";

// ── colour palette ───────────────────────────────────────────────────────────
export const COLORS = [
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
interface PropertyFormState { name: string; address: string; type: "house" | "cabin"; }
type NewPropertyFormState = PropertyFormState;
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
  dueDate: getLocalDateOnly(),
  description: "",
  assigneeId: "",
});

function dateFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return getLocalDateOnly(date);
}

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
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
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
    { key: "chores", label: "Chores", description: "Recurring household responsibilities." },
    { key: "meals", label: "Meals", description: "Meal plans, groceries, and recipes." },
    { key: "tasks", label: "Tasks", description: "Shared household lists, projects, and maintenance." },
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
          {visibilityError && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{visibilityError}</p>}
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
                { value: "none", label: "All sections collapsed" }, { value: "properties", label: "Properties" },
                { value: "notifications", label: "Notifications" }, { value: "memory", label: "AI memory" },
              ]}
              onChange={value => setTabPreference("settings", "startSection", value as "none" | "properties" | "notifications" | "memory")}
            />
          </div>
        </div>
      </div>
    </AccordionSection>
  );
}

// ── TaskForm ──────────────────────────────────────────────────────────────────
function TaskForm({ initial, members, onSave, onCancel, saving, creationOnly = false, error }: {
  initial: TaskFormState; members: any[]; onSave: (d: TaskFormState) => void; onCancel: () => void; saving: boolean; creationOnly?: boolean; error?: string;
}) {
  const [form, setForm] = useState<TaskFormState>(initial);
  const formId = useId();
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
      {!creationOnly && <div>
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
      </div>}
      <div>
        {(creationOnly || form.scheduleType === "recurring") ? (
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Repeat</span>
              <span className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Every</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={form.frequencyDays}
                  onChange={e => set("frequencyDays", Number(e.target.value))}
                  data-testid="input-maintenance-frequency"
                  className="w-16 border-x-0 border-b border-t-0 border-border bg-transparent px-1 py-0.5 text-center text-sm font-bold focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">days</span>
              </span>
            </label>
            <div>
              <label htmlFor={`${formId}-start-date`} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Starts on
              </label>
              <input
                id={`${formId}-start-date`}
                type="date"
                required
                value={form.dueDate}
                onChange={e => set("dueDate", e.target.value)}
                data-testid="input-maintenance-start-date"
                className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold focus:border-primary focus:outline-none"
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => set("dueDate", getLocalDateOnly())}
                  data-testid="button-maintenance-start-today"
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => set("dueDate", dateFromToday(7))}
                  data-testid="button-maintenance-start-next-week"
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  Next week
                </button>
              </div>
            </div>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Due
            </span>
            <input
              type="date"
              required
              value={form.dueDate}
              onChange={e => set("dueDate", e.target.value)}
              className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold focus:border-primary focus:outline-none"
            />
          </label>
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
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
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

// ── Recurring maintenance ──────────────────────────────────────────────────────
function PropertyTasksSection({ property, onGoToTasks }: { property: any; onGoToTasks: () => void }) {
  const propertyId = property.id;
  const timezone = getResolvedTimeZone();
  const maintenanceQuery = { propertyId, includeCompleted: true, timezone };
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useGetMaintenanceTasks(
    maintenanceQuery,
    { query: { queryKey: getGetMaintenanceTasksQueryKey(maintenanceQuery) } }
  );
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const createTask = useCreateMaintenanceTask();
  const updateTask = useUpdateMaintenanceTask();
  const deleteTask = useDeleteMaintenanceTask();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deletingTask, setDeletingTask] = useState<{ id: string; title: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey(maintenanceQuery) });

  const handleAdd = (data: TaskFormState) => {
    setSaveError("");
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
          // The server needs a due date; an omitted optional anchor starts today.
          nextDueDate: data.dueDate || getLocalDateOnly(),
          startDate: data.scheduleType === "recurring" ? data.dueDate || getLocalDateOnly() : null,
          timezone,
        },
      },
      {
        onSuccess: () => { invalidate(); setAdding(false); setSaveError(""); },
        onError: () => setSaveError("Could not save this maintenance task. Please try again."),
      }
    );
  };

  const handleEdit = (id: string, data: TaskFormState) => {
    setSaveError("");
    updateTask.mutate(
      {
        id,
        data: {
          title: data.title,
          category: data.category as UpdateMaintenanceTaskInputCategory,
          scheduleType: data.scheduleType,
          frequencyDays: data.scheduleType === "recurring" ? data.frequencyDays : undefined,
          startDate: data.scheduleType === "recurring" ? data.dueDate : null,
          nextDueDate: data.scheduleType === "one-time" ? data.dueDate : undefined,
          description: data.description || undefined,
          assigneeId: data.assigneeId || null,
          ...(data.scheduleType === "recurring" && { timezone }),
        },
      },
      {
        onSuccess: () => { invalidate(); setEditingId(null); setSaveError(""); },
        onError: () => setSaveError("Could not update this maintenance task. Please try again."),
      }
    );
  };

  const handleDelete = (id: string, title: string) => {
    deleteTask.reset();
    setDeletingTask({ id, title });
  };

  if (isLoading) {
    return <div className="py-4 flex gap-2 flex-col">{[1,2,3].map(i => <div key={i} className="h-9 bg-muted animate-pulse rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Create repeating upkeep here. Existing one-time records remain available to edit; add new one-off items in Tasks.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => setSuggesting(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5">
            <Sparkles className="h-3.5 w-3.5" /> Suggestions
          </button>
          <button type="button" onClick={onGoToTasks} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-background">
            <ClipboardList className="h-3.5 w-3.5" /> New one-off task
          </button>
        </div>
      </div>
      {suggesting && <MaintenanceSuggestions property={property} timezone={timezone} onClose={() => setSuggesting(false)} onCreated={invalidate} />}
      {tasks?.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground py-2 text-center">No maintenance records yet. Create a recurring schedule or use Suggestions.</p>
      )}

      {tasks?.filter(task => !(task.scheduleType === "one-time" && task.isCompleted)).map(task => {
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
                dueDate: task.scheduleType === "recurring"
                  ? task.startDate ?? task.nextDueDate
                  : task.nextDueDate,
                description: task.description ?? "",
                assigneeId: task.assigneeId ?? "",
              }}
              onSave={data => handleEdit(task.id, data)}
              onCancel={() => { setEditingId(null); setSaveError(""); }}
              saving={updateTask.isPending}
              error={saveError}
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
            <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
              <button
                onClick={() => { setEditingId(task.id); setSaveError(""); }}
                aria-label={`Edit ${task.title}`}
                data-testid={`button-edit-maintenance-${task.id}`}
                className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary sm:h-7 sm:w-7">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(task.id, task.title)}
                aria-label={`Delete ${task.title}`}
                data-testid={`button-delete-maintenance-${task.id}`}
                className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
      {(tasks ?? []).some(task => task.scheduleType === "one-time" && task.isCompleted) && (
        <div className="border-t border-border pt-3">
          <p className="mb-1 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Completed one-time history
          </p>
          <p className="mb-2 px-3 text-xs text-muted-foreground">
            These completed records are kept for reference. Edit one to reopen it.
          </p>
          {tasks?.filter(task => task.scheduleType === "one-time" && task.isCompleted).map(task => {
            const cat = getCat(task.category);
            if (editingId === task.id) {
              return (
                <TaskForm
                  key={task.id}
                  members={members ?? []}
                  initial={{
                    title: task.title,
                    category: task.category,
                    scheduleType: task.scheduleType,
                    frequencyDays: task.frequencyDays ?? 30,
                    dueDate: task.scheduleType === "recurring"
                      ? task.startDate ?? task.nextDueDate
                      : task.nextDueDate,
                    description: task.description ?? "",
                    assigneeId: task.assigneeId ?? "",
                  }}
                  onSave={data => handleEdit(task.id, data)}
                  onCancel={() => { setEditingId(null); setSaveError(""); }}
                  saving={updateTask.isPending}
                  error={saveError}
                />
              );
            }
            return (
              <div key={task.id} className="group flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${cat.bg}`}>
                  <cat.Icon className={`w-3 h-3 ${cat.color}`} />
                </div>
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{task.title}</span>
                <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Completed
                </span>
                <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                  <button
                    onClick={() => { setEditingId(task.id); setSaveError(""); }}
                    aria-label={`Edit ${task.title}`}
                    data-testid={`button-edit-maintenance-${task.id}`}
                    className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary sm:h-7 sm:w-7">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(task.id, task.title)}
                    aria-label={`Delete ${task.title}`}
                    data-testid={`button-delete-maintenance-${task.id}`}
                    className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <TaskForm
          members={members ?? []}
          initial={defaultTaskForm()}
          onSave={handleAdd}
          onCancel={() => { setAdding(false); setSaveError(""); }}
          saving={createTask.isPending}
          creationOnly
          error={saveError}
        />
      ) : (
        <button
          onClick={() => { setAdding(true); setSaveError(""); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground text-xs font-medium transition-all group">
          <Plus className="w-3.5 h-3.5 text-primary/60 group-hover:text-primary" />
           Add recurring maintenance
        </button>
      )}

      <ConfirmActionDialog
        open={!!deletingTask}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deleteTask.isPending) setDeletingTask(null);
        }}
        title="Delete Maintenance Task"
        description={`Are you sure you want to delete "${deletingTask?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive={true}
        pending={deleteTask.isPending}
        error={deleteTask.error ? ((deleteTask.error as any).data?.error || (deleteTask.error as Error).message || "Failed to delete task. Please try again.") : null}
        onConfirm={() => {
          if (deletingTask) {
            deleteTask.mutate(
              { id: deletingTask.id },
              {
                onSuccess: () => {
                  setDeletingTask(null);
                  invalidate();
                },
              }
            );
          }
        }}
      />
    </div>
  );
}

// ── PropertyRow — compact accordion row for one property ─────────────────────
function NewPropertyForm({ onSave, onCancel, saving }: {
  onSave: (data: NewPropertyFormState) => void;
  onCancel: () => void;
  saving: boolean;
  error?: string | null;
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

function PropertyRow({ property, onSaveInfo, onDelete, saving, deleting, canManage, isDefault, onGoToTasks }: {
  property: any;
  onSaveInfo: (data: PropertyFormState) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
  deleting: boolean;
  canManage: boolean;
  isDefault: boolean;
  onGoToTasks: () => void;
}) {
  const baseUrl = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const streetViewSrc = `${baseUrl}/api/properties/${property.id}/streetview`;
  const [imgError, setImgError] = useState(false);
  const isCabin = property.type === "cabin";
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState<PropertyFormState>({
    name: property.name,
    address: property.address ?? "",
    type: property.type === "cabin" ? "cabin" : "house",
  });
  const [tasksOpen, setTasksOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    try {
      await onSaveInfo(infoForm);
      setEditingInfo(false);
    } catch (err) {
      setSaveError((err as any)?.data?.error || (err as Error).message || "Failed to update property.");
    }
  };
  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await onDelete();
      setConfirmDelete(false);
    } catch (error) {
      const apiError = error as {
        status?: number;
        data?: {
          error?: string;
          code?: string;
          total?: number;
          dependencies?: Record<string, number>;
        };
      };
      const data = apiError.data;
      if (apiError.status === 409 && data?.code === "PROPERTY_HAS_DEPENDENCIES") {
        const labels: Record<string, string> = {
          chores: "chores",
          maintenanceTasks: "maintenance tasks",
          groceryLists: "grocery lists",
          mealPlans: "meal plans",
          recipes: "recipes",
          todoLists: "to-do lists",
          people: "people",
          contractors: "contractors",
          allowedUserProfiles: "property access assignments",
        };
        const details = Object.entries(data.dependencies ?? {})
          .filter(([, count]) => count > 0)
          .map(([key, count]) => `${count} ${labels[key] ?? key}`)
          .join(", ");
        setDeleteError(`This property still has ${data.total ?? "some"} household record${data.total === 1 ? "" : "s"}${details ? `: ${details}` : ""}. Reassign or clear them first.`);
      } else if (apiError.status === 409 && data?.code === "LAST_PROPERTY") {
        setDeleteError("This is the household's last property, so it cannot be deleted.");
      } else {
        setDeleteError(data?.error ?? "Unable to delete this property. Please try again.");
      }
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Property header */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4 bg-muted/20">
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

        {editingInfo && canManage ? (
          <form onSubmit={handleSave} className="flex-1 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              {([
                { type: "house" as const, label: "House", Icon: Home },
                { type: "cabin" as const, label: "Cabin", Icon: Mountain },
              ]).map(({ type, label, Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setInfoForm(form => ({ ...form, type }))}
                  className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                    infoForm.type === type
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input autoFocus required value={infoForm.name}
                onChange={e => setInfoForm(f => ({ ...f, name: e.target.value }))}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 font-bold text-sm focus:outline-none focus:border-primary"
                placeholder="Property name" />
              <input value={infoForm.address}
                onChange={e => setInfoForm(f => ({ ...f, address: e.target.value }))}
                className="flex-[2] bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                placeholder="123 Main St, City, ST" />
            </div>
            {saveError && <p role="alert" className="text-sm font-medium text-destructive">{saveError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEditingInfo(false); setSaveError(null); }}
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
            ) : canManage ? (
              <button onClick={() => setEditingInfo(true)} className="text-xs text-primary/60 hover:text-primary mt-0.5 flex items-center gap-1 transition-colors">
                <MapPin className="w-3 h-3 shrink-0" /> Add address…
              </button>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">No address added</p>
            )}
          </div>
        )}

        {!editingInfo && canManage && (
          <div className="ml-auto flex w-full gap-2 sm:w-auto">
            <button onClick={() => setEditingInfo(true)}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary sm:min-h-0 sm:flex-none sm:py-1.5">
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button onClick={() => { setDeleteError(null); setConfirmDelete(true); }}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-background px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 sm:min-h-0 sm:flex-none sm:py-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
      {deleteError && (
        <div role="alert" className="border-t border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
          {deleteError}
        </div>
      )}

      {/* Tasks accordion */}
      <button type="button" onClick={() => setTasksOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-border hover:bg-muted/30 transition-colors text-sm">
        <span className="flex items-center gap-2 font-semibold text-foreground/70">
          <Repeat className="w-3.5 h-3.5 text-primary/50" />
          Recurring maintenance
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${tasksOpen ? "rotate-180" : ""}`} />
      </button>

      {tasksOpen && (
        <div className="px-3 pb-3 border-t border-border/50 pt-1">
          <PropertyTasksSection property={property} onGoToTasks={onGoToTasks} />
        </div>
      )}
      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deleting) setConfirmDelete(false);
        }}
        title={`Delete ${property.name}?`}
        description={
          "This permanently deletes the property and cannot be undone.\n\nProperties with household records cannot be deleted. Reassign or clear chores, plans, lists, people, and other records first."
        }
        confirmLabel="Delete permanently"
        destructive={true}
        pending={deleting}
        error={deleteError}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}

// ── MemberForm ────────────────────────────────────────────────────────────────
function MemberForm({ initial, onSave, onCancel, saving, lockAdultRole = false }: {
  initial: MemberFormState; onSave: (d: MemberFormState) => void; onCancel: () => void; saving: boolean; lockAdultRole?: boolean; error?: string | null;
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
function MemberCard({ member, onEdit, onDelete, canManage }: { member: any; onEdit: () => void; onDelete: () => void; canManage: boolean }) {
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
        {canManage && <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button onClick={onEdit} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary sm:h-7 sm:w-7" title="Edit" aria-label={`Edit ${member.name}`}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {!member.hasLinkedAccount && (
            <button onClick={onDelete} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7" title="Delete" aria-label={`Delete ${member.name}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/memories");
      if (!res.ok) throw new Error("Could not load memories");
      const data = await res.json();
      setMemories(data.memories ?? []);
      setError(null);
    } catch {
      setError("Could not load memories. Please try again.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/ai/memories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete this memory");
      setMemories(prev => prev.filter(m => m.id !== id));
      setError(null);
    } catch {
      setError("Could not delete this memory. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return (
    <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded-xl" />)}</div>
  );

  if (memories.length === 0) return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
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
      {error && <p role="alert" className="text-sm font-medium text-destructive mb-2">{error}</p>}
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-100 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100"
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
              ? "HomeHub can alert this phone about dated Tasks, chores, recurring maintenance, and workout check-ins even when the app is closed."
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

const COMMON_US_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

function getTimeZoneLabel(timeZone: string) {
  try {
    const name = new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: "long" })
      .formatToParts(new Date())
      .find(part => part.type === "timeZoneName")?.value;
    return name ? `${timeZone.replace(/_/g, " ")} (${name})` : timeZone.replace(/_/g, " ");
  } catch {
    return timeZone.replace(/_/g, " ");
  }
}

function getFriendlyTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return time;
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function NotificationScheduleSection({ canManageSchedule }: { canManageSchedule: boolean }) {
  const queryClient = useQueryClient();
  const deviceTimeZone = getResolvedTimeZone();
  const {
    data: preferences,
    isLoading,
    isError,
    error: loadError,
  } = useGetNotificationPreferences({ query: { queryKey: getGetNotificationPreferencesQueryKey() } });
  const updatePreferences = useUpdateNotificationPreferences();
  const [timezone, setTimezone] = useState(deviceTimeZone);
  const [dueReminderTime, setDueReminderTime] = useState("08:00");
  const [workoutFollowUpTime, setWorkoutFollowUpTime] = useState("08:00");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!preferences) return;
    setTimezone(preferences.timezone || deviceTimeZone);
    setDueReminderTime(preferences.dueReminderTime || "08:00");
    setWorkoutFollowUpTime(preferences.workoutFollowUpTime || "08:00");
  }, [preferences, deviceTimeZone]);

  const timeZones = React.useMemo(() => {
    let supported: string[] = [];
    try {
      const supportedValuesOf = (Intl as typeof Intl & {
        supportedValuesOf?: (key: "timeZone") => string[];
      }).supportedValuesOf;
      supported = supportedValuesOf ? supportedValuesOf("timeZone") : [];
    } catch {
      supported = [];
    }
    return Array.from(new Set([deviceTimeZone, timezone, ...COMMON_US_TIME_ZONES, ...supported]));
  }, [deviceTimeZone, timezone]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveMessage(null);
    try {
      await updatePreferences.mutateAsync({
        data: { timezone, dueReminderTime, workoutFollowUpTime },
      });
      await queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
      setSaveMessage("Household notification schedule saved.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save the household notification schedule.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading household notification schedule">
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-12 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Could not load the household notification schedule. {loadError instanceof Error ? loadError.message : "Please try again."}
      </div>
    );
  }

  const current = preferences ?? { timezone: deviceTimeZone, dueReminderTime: "08:00", workoutFollowUpTime: "08:00" };
  if (!canManageSchedule) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground" data-testid="text-notification-schedule-read-only">
          You can view this household schedule, but only an approved linked family adult can change it. These times apply to every family device.
        </div>
        <dl className="grid gap-2 rounded-xl border border-border bg-background/60 p-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Household time zone</dt><dd className="mt-1 font-semibold text-foreground" data-testid="text-notification-timezone">{getTimeZoneLabel(current.timezone)}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Due-date reminders</dt><dd className="mt-1 font-semibold text-foreground" data-testid="text-due-reminder-time">{getFriendlyTime(current.dueReminderTime)}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Workout follow-up</dt><dd className="mt-1 font-semibold text-foreground" data-testid="text-workout-follow-up-time">{getFriendlyTime(current.workoutFollowUpTime)}</dd></div>
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label htmlFor="notification-timezone" className="text-sm font-bold text-foreground">Household time zone</label>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">This is the clock used for reminders on every family device.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select id="notification-timezone" value={timezone} onChange={event => setTimezone(event.target.value)} data-testid="select-notification-timezone" className="min-h-11 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
            {timeZones.map(zone => <option key={zone} value={zone}>{getTimeZoneLabel(zone)}</option>)}
          </select>
          <button type="button" onClick={() => setTimezone(deviceTimeZone)} data-testid="button-use-device-timezone" className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted">
            Use this device time zone
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <label htmlFor="due-reminder-time" className="text-sm font-bold text-foreground">Due-date reminder time</label>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Dated Tasks, chores, and recurring maintenance reminders use this time. Default: 8:00 AM.</p>
          <input id="due-reminder-time" type="time" value={dueReminderTime} onChange={event => setDueReminderTime(event.target.value)} required data-testid="input-due-reminder-time" className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <label htmlFor="workout-follow-up-time" className="text-sm font-bold text-foreground">Workout follow-up time</label>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Workout check-ins arrive the following morning because workouts currently have scheduled dates, not start times.</p>
          <input id="workout-follow-up-time" type="time" value={workoutFollowUpTime} onChange={event => setWorkoutFollowUpTime(event.target.value)} required data-testid="input-workout-follow-up-time" className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>
      <button type="submit" disabled={updatePreferences.isPending} data-testid="button-save-notification-schedule" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:w-auto">
        {updatePreferences.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {updatePreferences.isPending ? "Saving schedule…" : "Save schedule"}
      </button>
      {saveMessage && <p role={saveMessage.startsWith("Household") ? "status" : "alert"} data-testid="status-notification-schedule-save" className={`text-xs font-medium ${saveMessage.startsWith("Household") ? "text-green-700" : "text-destructive"}`}>{saveMessage}</p>}
    </form>
  );
}

function FamilyLinkingSection({ familyMembers }: { familyMembers: any[] }) {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  
  const { data: joinRequests, isLoading: joinRequestsLoading } = useListHouseholdJoinRequests({
    query: {
      queryKey: getListHouseholdJoinRequestsQueryKey(),
      enabled: me?.role === "family",
      refetchOnWindowFocus: true,
    },
  });
  
  const { data: invites, isLoading: invitesLoading, refetch: refetchInvites } = useListHouseholdInvites({
    query: {
      queryKey: getListHouseholdInvitesQueryKey(),
      enabled: me?.role === "family",
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
      refetchInterval: 15_000,
      staleTime: 0,
    },
  });

  const decideJoinRequest = useDecideHouseholdJoinRequest();
  const createInvite = useCreateHouseholdInvite();
  const revokeInvite = useRevokeHouseholdInvite();

  const [memberLinks, setMemberLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (me?.role !== "family" || !me.linkedFamilyMemberId) return null;

  const pendingRequests = joinRequests ?? [];
  const activeInvites = (invites ?? []).filter(inv => {
    // Only show invites that are not expired
    const isExpired = new Date(inv.expiresAt).getTime() < Date.now();
    return !isExpired;
  });

  const handleCreateInvite = async () => {
    setError(null);
    setCreatedToken(null);
    setCopied(false);
    try {
      const result = await createInvite.mutateAsync();
      // The token is returned in the response (CreatedHouseholdInvite)
      setCreatedToken(result.token);
      await queryClient.invalidateQueries({ queryKey: getListHouseholdInvitesQueryKey() });
    } catch {
      setError("Could not create invite link. Please try again.");
    }
  };

  const handleRevokeInvite = async (id: string) => {
    setError(null);
    try {
      await revokeInvite.mutateAsync({ inviteId: id });
      setCreatedToken(null);
      await queryClient.invalidateQueries({ queryKey: getListHouseholdInvitesQueryKey() });
    } catch {
      const refreshed = await refetchInvites();
      if (!refreshed.data?.some(invite => invite.id === id)) {
        setCreatedToken(null);
        return;
      }
      setError("Could not revoke the invite. Please try again.");
    }
  };

  const inviteLink = createdToken ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/invite#${createdToken}` : "";

  return (
    <AccordionSection
      icon={<LinkIcon className="h-4 w-4" />}
      title="Family Linking"
      summary={<span className="text-xs text-muted-foreground">{pendingRequests.length} pending request{pendingRequests.length === 1 ? "" : "s"}</span>}
      defaultOpen={pendingRequests.length > 0}
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invite Links</h3>
          <p className="mt-1 text-xs text-muted-foreground">Create secure links to let family adults join your household instantly.</p>
          
          <div className="mt-3 space-y-3">
            {createdToken && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-4">
                <p className="text-sm font-bold text-foreground">Invite link created</p>
                <p className="text-xs text-muted-foreground mb-3">Copy this link and send it to the new family member. It expires in 24 hours and can only be used once.</p>
                <div className="flex gap-2">
                  <input 
                    readOnly 
                    value={inviteLink} 
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground outline-none"
                    onClick={e => e.currentTarget.select()}
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }).catch(() => {});
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {!createdToken && (
              <button
                type="button"
                onClick={handleCreateInvite}
                disabled={createInvite.isPending}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-60"
              >
                {createInvite.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                Create new invite link
              </button>
            )}

            {invitesLoading && <div className="h-10 animate-pulse rounded-xl bg-muted" />}
            {!invitesLoading && activeInvites.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wider">Active invites</p>
                {activeInvites.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Invite generated</p>
                      <p className="text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(inv.id)}
                      disabled={revokeInvite.isPending}
                      className="text-xs font-bold text-destructive hover:text-destructive/80"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pending join requests</h3>
          <p className="mt-1 text-xs text-muted-foreground">Approve only accounts you recognize. Account emails are never shown here.</p>
          <div className="mt-3 space-y-3">
            {joinRequestsLoading && <div className="h-20 animate-pulse rounded-xl bg-muted" />}
            {!joinRequestsLoading && pendingRequests.length === 0 && (
              <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">No one is waiting for approval.</p>
            )}
            {pendingRequests.map(request => {
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
        
        {error && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p>}
      </div>
    </AccordionSection>
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
  
  const updateAccount = useUpdateUserProfile();
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

  const active = accounts?.filter(account => account.role !== "pending") ?? [];
  const accountLabel = (clerkId: string) =>
    clerkId === me.clerkId ? "Your account" : `Household account •••${clerkId.slice(-4)}`;

  return (
    <AccordionSection
      icon={<UserCog className="h-4 w-4" />}
      title="Household Roles & Access"
      summary={<span className="text-xs text-muted-foreground">{active.length} active account{active.length === 1 ? "" : "s"}</span>}
      defaultOpen={false}
    >
      <div className="space-y-6">
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
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      </div>
    </AccordionSection>
  );
}

function MergeDuplicateAdultsSection({ familyMembers }: { familyMembers: any[] }) {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const mergeDuplicate = useMergeDuplicateAdult();

  const [keepMemberId, setKeepMemberId] = useState("");
  const [legacyMemberId, setLegacyMemberId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (me?.role !== "family" || !me.linkedFamilyMemberId) return null;

  const linkedAdults = familyMembers.filter(m => m.role === "parent" && m.hasLinkedAccount);
  const unlinkedLegacyAdults = familyMembers.filter(m => m.role === "parent" && !m.hasLinkedAccount);

  if (linkedAdults.length === 0 || unlinkedLegacyAdults.length === 0) return null;

  const handleMergeRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keepMemberId || !legacyMemberId) return;
    setIsConfirmOpen(true);
  };

  const executeMerge = async () => {
    if (!keepMemberId || !legacyMemberId || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    
    try {
      const result = await mergeDuplicate.mutateAsync({
        data: {
          keepMemberId,
          legacyMemberId,
        }
      });
      setSuccess(`Successfully merged! Moved ${Object.values(result.transferredReferences).reduce((a: any,b: any)=>a+b,0)} records.`);
      setKeepMemberId("");
      setLegacyMemberId("");
      setIsConfirmOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }),
        // and other potential caches that hold member data
        queryClient.invalidateQueries()
      ]);
    } catch (err) {
      setError("Failed to merge duplicate adults. Please try again.");
      setIsConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const keepMember = linkedAdults.find(m => m.id === keepMemberId);
  const legacyMember = unlinkedLegacyAdults.find(m => m.id === legacyMemberId);

  return (
    <>
      <AccordionSection
        icon={<Merge className="w-4 h-4" />}
        title="Merge Duplicate Adult"
        summary={<span className="text-xs text-muted-foreground">Combine a legacy unlinked profile into a linked account</span>}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="bg-destructive/10 border-l-2 border-destructive p-3 rounded-r-xl">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <div className="text-sm text-foreground">
                <p className="font-bold text-destructive">Destructive Action</p>
                <p className="mt-1">Merging moves all assignments, history, and records from an old unlinked profile to an active linked profile. The old profile is permanently deleted.</p>
              </div>
            </div>
          </div>
          
          <form onSubmit={handleMergeRequest} className="space-y-4 bg-card border border-border p-4 rounded-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Keep (Active Linked Adult)</label>
                <div className="relative">
                  <select 
                    required
                    value={keepMemberId} 
                    onChange={e => setKeepMemberId(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                  >
                    <option value="">Select active adult to keep...</option>
                    {linkedAdults.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Merge & Delete (Legacy Adult)</label>
                <div className="relative">
                  <select 
                    required
                    value={legacyMemberId} 
                    onChange={e => setLegacyMemberId(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-destructive/50 bg-background px-3 py-2 text-sm text-foreground focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive shadow-sm"
                  >
                    <option value="">Select legacy adult to merge...</option>
                    {unlinkedLegacyAdults.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" />
                </div>
              </div>
            </div>

            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            {success && <p className="text-sm font-medium text-green-700">{success}</p>}

            <button
              type="submit"
              disabled={mergeDuplicate.isPending || isSubmitting || !keepMemberId || !legacyMemberId || keepMemberId === legacyMemberId}
              className="w-full mt-4 rounded-lg bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Merge and Delete Legacy Profile
            </button>
          </form>
        </div>
      </AccordionSection>

      {isConfirmOpen && keepMember && legacyMember && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/60 p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-sm animate-in fade-in duration-200 sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-destructive/30 bg-card shadow-xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border bg-destructive/5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">Confirm Merge</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                You are about to merge the legacy profile <span className="font-bold">{legacyMember.name}</span> into the linked profile <span className="font-bold">{keepMember.name}</span>.
              </p>
              <ul className="text-sm space-y-2 text-muted-foreground list-disc pl-5">
                <li>All history (workouts, meals, chores, etc.) will be transferred to <span className="font-bold text-foreground">{keepMember.name}</span>.</li>
                <li>The legacy profile <span className="font-bold text-destructive">{legacyMember.name}</span> will be permanently deleted.</li>
              </ul>
            </div>
            
            <div className="p-4 border-t border-border bg-muted/20 flex gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsConfirmOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-bold hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={executeMerge}
                className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:bg-destructive/90 transition-colors disabled:opacity-50 shadow-sm"
              >
                {isSubmitting ? "Merging..." : "Confirm Merge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// ── Stores ────────────────────────────────────────────────────────────────────
function StoreForm({ initial, onSave, onCancel, saving }: {
  initial?: HouseholdStore;
  onSave: (data: StoreInput) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const DEFAULT_DEPARTMENTS: StoreInputDepartmentsItem[] = [
    { categoryKey: "produce", displayName: "Produce" },
    { categoryKey: "deli", displayName: "Deli & Lunch Meat" },
    { categoryKey: "meat", displayName: "Meat & Seafood" },
    { categoryKey: "dairy", displayName: "Dairy & Eggs" },
    { categoryKey: "bread", displayName: "Bread & Bakery" },
    { categoryKey: "grains", displayName: "Grains & Pasta" },
    { categoryKey: "canned", displayName: "Canned & Pantry" },
    { categoryKey: "snacks", displayName: "Snacks" },
    { categoryKey: "frozen", displayName: "Frozen" },
    { categoryKey: "beverages", displayName: "Beverages" },
    { categoryKey: "household", displayName: "Household" },
    { categoryKey: "other", displayName: "Other" },
  ];

  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [departments, setDepartments] = useState<StoreInputDepartmentsItem[]>(
    initial?.departments?.map(d => ({ categoryKey: d.categoryKey, displayName: d.displayName })) ?? DEFAULT_DEPARTMENTS
  );

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...departments];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setDepartments(next);
  };

  const moveDown = (index: number) => {
    if (index === departments.length - 1) return;
    const next = [...departments];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    setDepartments(next);
  };

  const updateDeptName = (index: number, val: string) => {
    const next = [...departments];
    next[index] = { ...next[index], displayName: val };
    setDepartments(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      address: address.trim() || null,
      notes: notes.trim() || null,
      isDefault,
      departments: departments.map(d => ({
        categoryKey: d.categoryKey,
        displayName: d.displayName.trim() || d.categoryKey,
      }))
    });
  };

  return (
    <form onSubmit={handleSubmit} className="border border-border rounded-xl p-4 bg-muted/40 space-y-4">
      <div>
        <label htmlFor="store-name" className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Store Name</label>
        <input
          id="store-name"
          autoFocus
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Cub Foods - Minnetonka"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="store-address" className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Address (Optional)</label>
        <input
          id="store-address"
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="e.g. 123 Main St"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="store-notes" className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Notes (Optional)</label>
        <input
          id="store-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Enter on the left side"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
        <span className="text-sm font-bold text-foreground">Make default store</span>
      </label>

      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Department Order</p>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Order these to match your path through the store (e.g., Produce first if it's by the entrance).
        </p>
        <div className="space-y-2">
          {departments.map((dept, idx) => (
            <div key={dept.categoryKey} className="flex items-center gap-2 bg-background border border-border rounded-lg p-1.5 shadow-sm">
              <div className="flex flex-col gap-0.5 shrink-0 px-1">
                <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} aria-label={`Move ${dept.displayName || dept.categoryKey} up`} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded bg-muted/50 hover:bg-muted transition-colors">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => moveDown(idx)} disabled={idx === departments.length - 1} aria-label={`Move ${dept.displayName || dept.categoryKey} down`} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded bg-muted/50 hover:bg-muted transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <label htmlFor={`dept-${dept.categoryKey}`} className="sr-only">Display name for {dept.categoryKey}</label>
                <input
                  id={`dept-${dept.categoryKey}`}
                  required
                  value={dept.displayName}
                  onChange={e => updateDeptName(idx, e.target.value)}
                  className="w-full text-sm font-medium bg-transparent focus:outline-none focus:text-primary"
                  placeholder={dept.categoryKey}
                />
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">{dept.categoryKey}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-1.5 rounded-lg border border-border text-sm font-bold hover:bg-muted transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? "Saving…" : "Save Store"}
        </button>
      </div>
    </form>
  );
}

function StoresSection({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data: stores, isLoading } = useGetStores({ query: { queryKey: getGetStoresQueryKey() } });

  const createStore = useCreateStore();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingStore, setDeletingStore] = useState<{ id: string; name: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetStoresQueryKey() });

  const handleAdd = (data: StoreInput) => {
    setErrorMsg(null);
    createStore.mutate(
      { data },
      {
        onSuccess: () => { invalidate(); setAdding(false); },
        onError: (err: any) => setErrorMsg(err.data?.error || err.message || "Failed to add store")
      }
    );
  };

  const handleEdit = (id: string, data: StoreInput) => {
    setErrorMsg(null);
    updateStore.mutate(
      { id, data },
      {
        onSuccess: () => { invalidate(); setEditingId(null); },
        onError: (err: any) => setErrorMsg(err.data?.error || err.message || "Failed to update store")
      }
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (stores?.length === 1) {
      setErrorMsg("Cannot delete the final store.");
      return;
    }
    deleteStore.reset();
    setDeletingStore({ id, name });
  };

  return (
    <AccordionSection
      icon={<Store className="w-4 h-4" />}
      title="Stores & Aisle Order"
      summary={<span className="text-xs text-muted-foreground">{isLoading ? "Loading stores…" : `${stores?.length ?? 0} store${stores?.length === 1 ? "" : "s"}`}</span>}
      defaultOpen={false}
      action={
        canEdit && !adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            title="Add store"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Configure stores and arrange their departments in the exact order you walk through the aisles.
        </p>

        {errorMsg && (
          <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isLoading && <div className="py-2 flex flex-col gap-2">{[1,2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>}

        {!isLoading && stores?.length === 0 && !adding && (
          <div className="text-center py-6 px-4 bg-muted/30 rounded-xl border border-dashed border-border">
            <Store className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No stores added</p>
            <p className="text-xs text-muted-foreground mt-1">Add a store to start organizing your groceries.</p>
          </div>
        )}

        {adding && (
          <StoreForm
            onSave={handleAdd}
            onCancel={() => { setAdding(false); setErrorMsg(null); }}
            saving={createStore.isPending}
          />
        )}

        {!isLoading && stores?.map(store => {
          if (editingId === store.id) {
            return (
              <StoreForm
                key={store.id}
                initial={store}
                onSave={data => handleEdit(store.id, data)}
                onCancel={() => { setEditingId(null); setErrorMsg(null); }}
                saving={updateStore.isPending}
              />
            );
          }

          return (
            <div key={store.id} className="group relative flex flex-col sm:flex-row sm:items-start gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-border hover:shadow-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-base font-bold text-foreground truncate">{store.name}</h4>
                  {store.isDefault && (
                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Default</span>
                  )}
                </div>
                {store.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{store.address}</span>
                  </p>
                )}

                {/* Department preview */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {store.departments.slice(0, 5).map((dept, i) => (
                    <span key={dept.categoryKey} className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground truncate max-w-[100px]">
                      {dept.displayName}
                    </span>
                  ))}
                  {store.departments.length > 5 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-muted-foreground">
                      +{store.departments.length - 5} more
                    </span>
                  )}
                </div>
              </div>

              {canEdit && (
                <div className="flex shrink-0 sm:flex-col gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingId(store.id); setErrorMsg(null); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(store.id, store.name)} disabled={deleteStore.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmActionDialog
        open={!!deletingStore}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deleteStore.isPending) setDeletingStore(null);
        }}
        title="Delete Store"
        description={`Are you sure you want to delete store "${deletingStore?.name}"?`}
        confirmLabel="Delete"
        destructive={true}
        pending={deleteStore.isPending}
        error={deleteStore.error ? ((deleteStore.error as any).data?.error || (deleteStore.error as Error).message || "Failed to delete store. Please try again.") : null}
        onConfirm={() => {
          if (deletingStore) {
            deleteStore.mutate(
              { id: deletingStore.id },
              {
                onSuccess: () => {
                  setDeletingStore(null);
                  invalidate();
                },
              }
            );
          }
        }}
      />
    </AccordionSection>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { preferences, setTabPreference } = usePreferences();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const canManageProperties = me?.role === "family" && !!me.linkedFamilyMemberId;
  const canManageMembers = me?.role === "family" && !!me.linkedFamilyMemberId;

  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const canManageNotificationSchedule = me?.role === "family"
    && !!me.linkedFamilyMemberId
    && !!familyMembers?.some(member => member.id === me.linkedFamilyMemberId && member.role === "parent" && member.hasLinkedAccount);
  const {
    data: properties,
    isLoading: propertiesLoading,
    isError: propertiesError,
    error: propertiesLoadError,
  } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });

  const createMember = useCreateFamilyMember();
  const updateMember = useUpdateFamilyMember();
  const deleteMember = useDeleteFamilyMember();
  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const deleteProperty = useDeleteProperty();

  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [addingProperty, setAddingProperty] = useState(false);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [deletingMember, setDeletingMember] = useState<any>(null);

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

      <YourProfile />

      <AppearanceAndTabsSection />

      {me?.role === "family" && me.isAdmin && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-foreground">Guided household setup</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review your household details and add any missing starter lists, chores, or maintenance tasks.
                Existing content and tab preferences will be preserved.
              </p>
            </div>
            <button
              type="button"
              data-testid="settings-run-setup"
              onClick={() => navigate("/setup")}
              className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Run setup again
            </button>
          </CardContent>
        </Card>
      )}

      <FamilyLinkingSection familyMembers={familyMembers ?? []} />

      <AccountsAndAccessSection familyMembers={familyMembers ?? []} />

      <MergeDuplicateAdultsSection familyMembers={familyMembers ?? []} />

      {/* ── Family Members ──────────────────────────────────────────────────── */}
      <AccordionSection
        icon={<Users className="w-4 h-4" />}
        title="Family Members"
        summary={memberSummary}
        defaultOpen={false}
        action={
          canManageMembers && !addingMember ? (
            <button onClick={() => { setAddingMember(true); setEditingMemberId(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          ) : undefined
        }
      >
        {canManageMembers && addingMember && (
          <div className="mb-5">
            <MemberForm initial={{ name: "", role: "child", color: COLORS[0], photoUrl: "" }}
              onSave={data => {
                setMemberError(null);
                createMember.mutate({ data: { name: data.name, role: data.role as "child" | "pet", color: data.color, photoUrl: data.photoUrl || null } },
                { onSuccess: () => { invalidateMembers(); setAddingMember(false); }, onError: (err) => setMemberError((err as any)?.data?.error || (err as Error).message || "Failed to add member") })
              }}
              onCancel={() => { setMemberError(null); setAddingMember(false); }} saving={createMember.isPending} error={memberError} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {familyMembers?.map(member =>
            canManageMembers && editingMemberId === member.id ? (
              <div key={member.id} className="sm:col-span-2 md:col-span-3">
                <MemberForm
                  initial={{ name: member.name, role: member.role as Role, color: member.color, photoUrl: member.photoUrl ?? "" }}
                  lockAdultRole={member.role === "parent" && member.hasLinkedAccount}
                  onSave={data => {
                    setMemberError(null);
                    updateMember.mutate({ id: member.id, data: { name: data.name, role: data.role, color: data.color, photoUrl: data.photoUrl || null } },
                    { onSuccess: () => { invalidateMembers(); setEditingMemberId(null); }, onError: (err) => setMemberError((err as any)?.data?.error || (err as Error).message || "Failed to update member") })
                  }}
                  onCancel={() => { setMemberError(null); setEditingMemberId(null); }} saving={updateMember.isPending} error={memberError} />
              </div>
            ) : (
              <MemberCard key={member.id} member={member}
                canManage={canManageMembers}
                onEdit={() => { setEditingMemberId(member.id); setAddingMember(false); }}
                onDelete={() => {
                  deleteMember.reset();
                  setDeletingMember(member);
                }} />
            )
          )}
        </div>

        {canManageMembers && !addingMember && (
          <button onClick={() => { setAddingMember(true); setEditingMemberId(null); }}
            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground text-sm font-medium transition-all">
            <Plus className="w-4 h-4 text-primary/60" /> Add family member
          </button>
        )}

        <ConfirmActionDialog
          open={!!deletingMember}
          onOpenChange={(isOpen) => {
            if (!isOpen && !deleteMember.isPending) setDeletingMember(null);
          }}
          title="Remove Family Member"
          description={
            deletingMember
              ? `Remove ${deletingMember.name}? This only works when they have no linked account or household history.`
              : ""
          }
          confirmLabel="Remove"
          destructive={true}
          pending={deleteMember.isPending}
          error={
            deleteMember.isError
              ? deletingMember?.role === "parent"
                ? "This legacy adult still has household history. Use Merge Duplicate Adult so their history is transferred safely."
                : "This family member still has household history and cannot be removed until it is reassigned."
              : null
          }
          onConfirm={() => {
            if (deletingMember) {
              deleteMember.mutate(
                { id: deletingMember.id },
                {
                  onSuccess: () => {
                    invalidateMembers();
                    setDeletingMember(null);
                  },
                }
              );
            }
          }}
        />
      </AccordionSection>

      {/* ── Properties ──────────────────────────────────────────────────────── */}
      <AccordionSection
        icon={<Home className="w-4 h-4" />}
        title="Properties"
        summary={<span className="text-xs text-muted-foreground">{propertiesLoading ? "Loading properties…" : `${properties?.length ?? 0} propert${properties?.length === 1 ? "y" : "ies"}`}</span>}
        defaultOpen={preferences.tabs.settings.startSection === "properties"}
        action={
          canManageProperties && !addingProperty ? (
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
          <div>
            <h2 className="text-sm font-bold text-foreground">Your household properties</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Every property your approved account can access is listed here, including shared homes and cabins.
            </p>
          </div>
          {!canManageProperties && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              You have read-only property access. An approved linked family account can add, edit, or delete properties; your existing authorized properties and maintenance remain available.
            </div>
          )}
          {propertiesLoading && (
            <div className="space-y-2 py-2" role="status" aria-label="Loading properties">
              {[1, 2].map(index => <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />)}
            </div>
          )}
          {propertiesError && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Could not load your properties. {propertiesLoadError instanceof Error ? propertiesLoadError.message : "Please try again."}
            </div>
          )}
          {!propertiesLoading && !propertiesError && properties?.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-5 text-center">
              <p className="text-sm font-bold text-foreground">No accessible properties</p>
              <p className="mt-1 text-xs text-muted-foreground">{canManageProperties ? "Add the first property for this household." : "Ask a household administrator to grant property access."}</p>
            </div>
          )}
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
          {canManageProperties && addingProperty && (
            <NewPropertyForm
              onSave={data => {
                setPropertyError(null);
                createProperty.mutate(
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
                  onError: (err) => setPropertyError((err as any)?.data?.error || (err as Error).message || "Failed to add property"),
                },
              )}}
              onCancel={() => {
                setPropertyError(null);
                setAddingProperty(false);
              }}
              saving={createProperty.isPending}
              error={propertyError}
            />
          )}
          {properties?.map(property => (
            <PropertyRow
              key={property.id}
              property={property}
              isDefault={property.id === defaultPropertyId}
              canManage={canManageProperties}
              onGoToTasks={() => navigate("/tasks")}
              onSaveInfo={async data => {
                await updateProperty.mutateAsync({
                  id: property.id,
                  data: {
                    name: data.name,
                    address: data.address || null,
                    type: data.type,
                    icon: data.type === "cabin" ? "mountain" : "home",
                  },
                });
                invalidateProps();
              }}
              onDelete={async () => {
                await deleteProperty.mutateAsync({ id: property.id });
                if (preferences.tabs.properties.defaultProperty === property.id) {
                  setTabPreference("properties", "defaultProperty", "");
                }
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: getGetPropertiesQueryKey() }),
                  queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
                ]);
              }}
              saving={updateProperty.isPending}
              deleting={deleteProperty.isPending}
            />
          ))}
          {canManageProperties && !addingProperty && (
            <button
              onClick={() => setAddingProperty(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-muted/30"
            >
              <Plus className="h-4 w-4 text-primary/60" /> Add property
            </button>
          )}
        </div>
      </AccordionSection>

      <StoresSection canEdit={canManageProperties} />

      <AccordionSection
        icon={<Bell className="w-4 h-4" />}
        title="Phone Notifications"
        summary={<span className="text-xs text-muted-foreground">Household reminder schedule and this phone’s alerts</span>}
        defaultOpen={preferences.tabs.settings.startSection === "notifications"}
      >
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-foreground">Household reminder schedule</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Set when household reminders are sent, then choose whether this individual phone receives them.</p>
            <div className="mt-3">
              <NotificationScheduleSection canManageSchedule={canManageNotificationSchedule} />
            </div>
          </div>
          <div className="border-t border-border pt-5">
            <h2 className="text-sm font-bold text-foreground">This phone</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Push alerts are enabled separately on each device.</p>
            <div className="mt-3">
              <WebNotificationsSection />
            </div>
          </div>
        </div>
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
