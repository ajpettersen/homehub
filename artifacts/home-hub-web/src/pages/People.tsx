import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Check,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

const DEFAULT_GROUPS = [
  "Baseball",
  "Cabin",
  "House neighbors",
  "PTO",
  "School",
  "Family friends",
];

interface Person {
  id: string;
  name: string;
  groups: string[];
  notes: string | null;
  createdAt: string;
}

interface PersonFormState {
  name: string;
  groups: string[];
  notes: string;
}

const emptyForm = (): PersonFormState => ({ name: "", groups: [], notes: "" });

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");
}

function PersonForm({
  initial,
  availableGroups,
  onSave,
  onCancel,
  saving,
}: {
  initial: PersonFormState;
  availableGroups: string[];
  onSave: (form: PersonFormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<PersonFormState>(initial);
  const [newGroup, setNewGroup] = useState("");

  const toggleGroup = (group: string) => {
    setForm(current => ({
      ...current,
      groups: current.groups.includes(group)
        ? current.groups.filter(item => item !== group)
        : [...current.groups, group],
    }));
  };

  const addCustomGroup = (event: React.FormEvent) => {
    event.preventDefault();
    const group = newGroup.trim();
    if (!group) return;
    setForm(current => ({
      ...current,
      groups: current.groups.includes(group) ? current.groups : [...current.groups, group],
    }));
    setNewGroup("");
  };

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (form.name.trim()) onSave({ ...form, name: form.name.trim() });
      }}
      className="rounded-2xl border-2 border-primary/20 bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-xl font-bold">{initial.name ? "Edit person" : "Add person"}</h2>
        <button type="button" onClick={onCancel} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Name</label>
          <input
            autoFocus
            required
            maxLength={120}
            value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
            placeholder="e.g. Sarah Johnson"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">How do you know them?</label>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...availableGroups, ...form.groups])].map(group => {
              const selected = form.groups.includes(group);
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {selected && <Check className="mr-1 inline-block w-3 h-3" />}
                  {group}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newGroup}
              maxLength={40}
              onChange={event => setNewGroup(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomGroup(event);
                }
              }}
              placeholder="Add another label…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
            />
            <button type="button" onClick={addCustomGroup} disabled={!newGroup.trim()} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-40">
              Add label
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Notes <span className="font-normal normal-case">(optional)</span></label>
          <textarea
            maxLength={1000}
            rows={3}
            value={form.notes}
            onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}
            placeholder="Anything useful to remember…"
            className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={saving || !form.name.trim()} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : initial.name ? "Save changes" : "Add person"}
        </button>
      </div>
    </form>
  );
}

function PersonCard({ person, onEdit, onDelete }: { person: Person; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {initials(person.name) || <UserRound className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold text-base">{person.name}</h3>
            {person.groups.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {person.groups.map(group => (
                  <span key={group} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    <Tag className="w-2.5 h-2.5" />{group}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No group added yet</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button onClick={onEdit} title={`Edit ${person.name}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} title={`Remove ${person.name}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {person.notes && (
          <p className="mt-3 border-t border-border/70 pt-3 text-sm leading-relaxed text-muted-foreground">{person.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function People() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("All people");
  const [form, setForm] = useState<PersonFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPeople = useCallback(async () => {
    try {
      const response = await fetch("/api/people");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load people");
      setPeople(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load people");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const groups = useMemo(() => {
    const discovered = people.flatMap(person => person.groups);
    return [...new Set([...DEFAULT_GROUPS, ...discovered])];
  }, [people]);

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    return people.filter(person => {
      const matchesGroup = activeGroup === "All people" || person.groups.includes(activeGroup);
      const matchesSearch = !query || [person.name, person.notes ?? "", ...person.groups].join(" ").toLowerCase().includes(query);
      return matchesGroup && matchesSearch;
    });
  }, [people, search, activeGroup]);

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const startEdit = (person: Person) => {
    setEditingId(person.id);
    setForm({ name: person.name, groups: person.groups, notes: person.notes ?? "" });
  };

  const savePerson = async (values: PersonFormState) => {
    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/people/${editingId}` : "/api/people", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save person");
      setPeople(current => editingId ? current.map(person => person.id === editingId ? data : person) : [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(null);
      setEditingId(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save person");
    } finally {
      setSaving(false);
    }
  };

  const deletePerson = async (person: Person) => {
    if (!confirm(`Remove ${person.name} from People?`)) return;
    const response = await fetch(`/api/people/${person.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Unable to remove person");
      return;
    }
    setPeople(current => current.filter(item => item.id !== person.id));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground md:text-5xl">People</h1>
          <p className="mt-1 font-medium text-muted-foreground">Keep track of the people connected to your family.</p>
        </div>
        <button onClick={startAdd} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add person
        </button>
      </div>

      {form && (
        <PersonForm
          initial={form}
          availableGroups={groups}
          onSave={savePerson}
          onCancel={() => { setForm(null); setEditingId(null); }}
          saving={saving}
        />
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search people or notes…"
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
          {["All people", ...groups].map(group => (
            <button
              key={group}
              onClick={() => setActiveGroup(group)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeGroup === group ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : filteredPeople.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UsersRound className="w-5 h-5" />
          </div>
          <h2 className="font-serif text-xl font-bold">{people.length === 0 ? "Start your people list" : "No people found"}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {people.length === 0 ? "Add neighbors, teammates, school friends, and anyone else you want to remember." : "Try a different search or group."}
          </p>
          {people.length === 0 && (
            <button onClick={startAdd} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4" /> Add your first person
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPeople.map(person => (
            <PersonCard key={person.id} person={person} onEdit={() => startEdit(person)} onDelete={() => deletePerson(person)} />
          ))}
        </div>
      )}
    </div>
  );
}