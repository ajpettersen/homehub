import React, { useState, useEffect, useCallback } from "react";
import {
  useGetFamilyMembers, useCreateFamilyMember, useUpdateFamilyMember, useDeleteFamilyMember,
  useGetProperties, useUpdateProperty,
  useGetMaintenanceTasks, getGetMaintenanceTasksQueryKey,
  useCreateMaintenanceTask, useUpdateMaintenanceTask, useDeleteMaintenanceTask,
  getGetFamilyMembersQueryKey, getGetPropertiesQueryKey,
  type CreateMaintenanceTaskInputCategory,
  type UpdateMaintenanceTaskInputCategory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Home, Users, Plus, Pencil, Trash2, X, Check, MapPin, Image, Mountain,
  CalendarDays, Wrench, Droplets, Filter, Leaf, Repeat, ChevronDown,
  ClipboardList, Brain, Sparkles,
} from "lucide-react";

// ── colour palette ───────────────────────────────────────────────────────────
const COLORS = [
  "#C1440E","#2D6A4F","#E07B39","#4A90D9","#9B59B6",
  "#E74C3C","#2ECC71","#F39C12","#1ABC9C","#E91E8C","#607D8B","#795548",
];
const ROLES = ["parent", "child", "pet"] as const;
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
interface TaskFormState {
  title: string;
  category: string;
  scheduleType: "recurring" | "one-time";
  frequencyDays: number;
  dueDate: string;
  description: string;
}
const defaultTaskForm = (): TaskFormState => ({
  title: "",
  category: "other",
  scheduleType: "recurring",
  frequencyDays: 30,
  dueDate: new Date().toISOString().split("T")[0],
  description: "",
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
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3.5 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
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
        {action && open && <div onClick={e => e.stopPropagation()}>{action}</div>}
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

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

// ── TaskForm ──────────────────────────────────────────────────────────────────
function TaskForm({ initial, onSave, onCancel, saving }: {
  initial: TaskFormState; onSave: (d: TaskFormState) => void; onCancel: () => void; saving: boolean;
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
              initial={{
                title: task.title,
                category: task.category,
                scheduleType: task.scheduleType ?? "recurring",
                frequencyDays: task.frequencyDays ?? 30,
                dueDate: task.nextDueDate,
                description: task.description ?? "",
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
function PropertyRow({ property, onSaveInfo, saving }: {
  property: any; onSaveInfo: (data: PropertyFormState) => void; saving: boolean;
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

        {editingInfo ? (
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
            </div>
            {property.address ? (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 shrink-0" />{property.address}
              </p>
            ) : (
              <button onClick={() => setEditingInfo(true)} className="text-xs text-primary/60 hover:text-primary mt-0.5 flex items-center gap-1 transition-colors">
                <MapPin className="w-3 h-3 shrink-0" /> Add address…
              </button>
            )}
          </div>
        )}

        {!editingInfo && (
          <button onClick={() => setEditingInfo(true)}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors shrink-0">
            <Pencil className="w-3.5 h-3.5" />
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
function MemberForm({ initial, onSave, onCancel, saving }: {
  initial: MemberFormState; onSave: (d: MemberFormState) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState<MemberFormState>(initial);
  const set = (k: keyof MemberFormState, v: string) => setForm(f => ({ ...f, [k]: v }));

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
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Role</label>
        <div className="flex gap-2">
          {ROLES.map(r => (
            <button key={r} type="button" onClick={() => set("role", r)}
              className={`flex-1 py-2 rounded-xl font-bold text-sm capitalize transition-all border-2 ${form.role === r ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"}`}>
              {r}
            </button>
          ))}
        </div>
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
function MemberCard({ member, onEdit, onDelete }: { member: any; onEdit: () => void; onDelete: () => void }) {
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
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── AiMemorySection ───────────────────────────────────────────────────────────
interface Memory { id: number; content: string; category: string; createdAt: string; }

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
          <span className="flex-1 text-sm text-foreground leading-snug">{m.content}</span>
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

// ── main page ─────────────────────────────────────────────────────────────────
export default function Settings() {
  const queryClient = useQueryClient();

  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });

  const createMember = useCreateFamilyMember();
  const updateMember = useUpdateFamilyMember();
  const deleteMember = useDeleteFamilyMember();
  const updateProperty = useUpdateProperty();

  const [addingMember, setAddingMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Page header */}
      <div className="pb-1">
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 font-medium">Manage your household, properties, and AI preferences.</p>
      </div>

      {/* ── Properties ──────────────────────────────────────────────────────── */}
      <AccordionSection
        icon={<Home className="w-4 h-4" />}
        title="Properties"
        summary={<span className="text-xs text-muted-foreground">{properties?.length ?? 0} propert{properties?.length === 1 ? "y" : "ies"}</span>}
        defaultOpen={true}
      >
        <div className="space-y-3">
          {properties?.map(property => (
            <PropertyRow
              key={property.id}
              property={property}
              onSaveInfo={data => updateProperty.mutate({ id: property.id, data: { name: data.name, address: data.address || null } }, { onSuccess: invalidateProps })}
              saving={updateProperty.isPending}
            />
          ))}
        </div>
      </AccordionSection>

      {/* ── Family Members ──────────────────────────────────────────────────── */}
      <AccordionSection
        icon={<Users className="w-4 h-4" />}
        title="Family Members"
        summary={memberSummary}
        defaultOpen={false}
        action={
          !addingMember ? (
            <button onClick={() => { setAddingMember(true); setEditingMemberId(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          ) : undefined
        }
      >
        {addingMember && (
          <div className="mb-5">
            <MemberForm initial={{ name: "", role: "child", color: COLORS[0], photoUrl: "" }}
              onSave={data => createMember.mutate({ data: { name: data.name, role: data.role, color: data.color, photoUrl: data.photoUrl || null } },
                { onSuccess: () => { invalidateMembers(); setAddingMember(false); } })}
              onCancel={() => setAddingMember(false)} saving={createMember.isPending} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {familyMembers?.map(member =>
            editingMemberId === member.id ? (
              <div key={member.id} className="sm:col-span-2 md:col-span-3">
                <MemberForm
                  initial={{ name: member.name, role: member.role as Role, color: member.color, photoUrl: member.photoUrl ?? "" }}
                  onSave={data => updateMember.mutate({ id: member.id, data: { name: data.name, role: data.role, color: data.color, photoUrl: data.photoUrl || null } },
                    { onSuccess: () => { invalidateMembers(); setEditingMemberId(null); } })}
                  onCancel={() => setEditingMemberId(null)} saving={updateMember.isPending} />
              </div>
            ) : (
              <MemberCard key={member.id} member={member}
                onEdit={() => { setEditingMemberId(member.id); setAddingMember(false); }}
                onDelete={() => { if (confirm(`Remove ${member.name}?`)) deleteMember.mutate({ id: member.id }, { onSuccess: invalidateMembers }); }} />
            )
          )}
        </div>

        {!addingMember && (
          <button onClick={() => { setAddingMember(true); setEditingMemberId(null); }}
            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground text-sm font-medium transition-all">
            <Plus className="w-4 h-4 text-primary/60" /> Add family member
          </button>
        )}
      </AccordionSection>

      {/* ── AI Memory ───────────────────────────────────────────────────────── */}
      <AccordionSection
        icon={<Brain className="w-4 h-4" />}
        title="AI Memory"
        summary={<span className="text-xs text-muted-foreground">What the assistant has learned about your family</span>}
        defaultOpen={false}
      >
        <AiMemorySection />
      </AccordionSection>
    </div>
  );
}
