import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link } from "wouter";
import { usePreferences } from "@/context/PreferencesContext";
import { Card, CardContent } from "@/components/ui/card";
import {
  Check,
  CalendarClock,
  CheckCircle2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  UserRound,
  UsersRound,
  Wrench,
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
  propertyId: string | null;
  name: string;
  groups: string[];
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
}

interface PersonFormState {
  name: string;
  groups: string[];
  photoUrl: string;
  phone: string;
  email: string;
  notes: string;
  lastContactedAt: string;
  nextFollowUpAt: string;
}

interface Contractor {
  id: string;
  propertyId: string | null;
  name: string;
  trade: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  pastWork: string | null;
  preferred: boolean;
  matchScore?: number;
  createdAt: string;
}

interface ContractorFormState {
  name: string;
  trade: string;
  phone: string;
  email: string;
  notes: string;
  pastWork: string;
  preferred: boolean;
}

const emptyForm = (): PersonFormState => ({
  name: "", groups: [], photoUrl: "", phone: "", email: "", notes: "", lastContactedAt: "", nextFollowUpAt: "",
});
const emptyContractorForm = (): ContractorFormState => ({
  name: "", trade: "", phone: "", email: "", notes: "", pastWork: "", preferred: false,
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");
}

function followUpLabel(date: string | null) {
  if (!date) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return "Follow-up overdue";
  if (date === today) return "Follow up today";
  return `Follow up ${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
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
        <button type="button" onClick={onCancel} aria-label="Close person form" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="person-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Name</label>
          <input
            id="person-name"
            autoFocus
            required
            maxLength={120}
            value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
            placeholder="e.g. Sarah Johnson"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium outline-none focus:border-primary"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Phone <span className="font-normal normal-case">(optional)</span></label>
            <input
              aria-label="Person phone"
              inputMode="tel"
              maxLength={40}
              value={form.phone}
              onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}
              placeholder="(555) 555-5555"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Email <span className="font-normal normal-case">(optional)</span></label>
            <input
              aria-label="Person email"
              type="email"
              maxLength={254}
              value={form.email}
              onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Photo URL <span className="font-normal normal-case">(optional)</span></label>
          <input
            aria-label="Person photo URL"
            type="url"
            maxLength={1000}
            value={form.photoUrl}
            onChange={event => setForm(current => ({ ...current, photoUrl: event.target.value }))}
            placeholder="https://…"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
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
              aria-label="Add another relationship label"
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
          <label htmlFor="person-notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Notes <span className="font-normal normal-case">(optional)</span></label>
          <textarea
            id="person-notes"
            maxLength={1000}
            rows={3}
            value={form.notes}
            onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}
            placeholder="Anything useful to remember…"
            className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Last contacted <span className="font-normal normal-case">(optional)</span></label>
            <input
              aria-label="Last contacted date"
              type="date"
              value={form.lastContactedAt}
              onChange={event => setForm(current => ({ ...current, lastContactedAt: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Next follow-up <span className="font-normal normal-case">(optional)</span></label>
            <input
              aria-label="Next follow-up date"
              type="date"
              value={form.nextFollowUpAt}
              onChange={event => setForm(current => ({ ...current, nextFollowUpAt: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
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
  const followUp = followUpLabel(person.nextFollowUpAt);
  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
            {person.photoUrl ? (
              <img src={person.photoUrl} alt={person.name} className="h-full w-full object-cover" />
            ) : (
              initials(person.name) || <UserRound className="w-5 h-5" />
            )}
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
            <button onClick={onEdit} title={`Edit ${person.name}`} aria-label={`Edit ${person.name}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} title={`Remove ${person.name}`} aria-label={`Remove ${person.name}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {(person.phone || person.email) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {person.phone && (
              <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary">
                <Phone className="w-3 h-3" /> Call
              </a>
            )}
            {person.email && (
              <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary">
                <Mail className="w-3 h-3" /> Email
              </a>
            )}
          </div>
        )}
        {person.notes && (
          <p className="mt-3 border-t border-border/70 pt-3 text-sm leading-relaxed text-muted-foreground">{person.notes}</p>
        )}
        {followUp && (
          <div className={`mt-3 flex items-center gap-1.5 text-xs font-bold ${person.nextFollowUpAt! < new Date().toISOString().slice(0, 10) ? "text-destructive" : "text-primary"}`}>
            <CalendarClock className="w-3.5 h-3.5" /> {followUp}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContractorForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ContractorFormState;
  onSave: (form: ContractorFormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof ContractorFormState>(key: K, value: ContractorFormState[K]) =>
    setForm(current => ({ ...current, [key]: value }));

  return (
    <form onSubmit={event => { event.preventDefault(); if (form.name.trim() && form.trade.trim()) onSave({ ...form, name: form.name.trim(), trade: form.trade.trim() }); }}
      className="rounded-2xl border-2 border-primary/20 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold">{initial.name ? "Edit contractor" : "Add contractor"}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Save people you trust for home repairs and services.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close contractor form" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</label>
            <input aria-label="Contractor name" autoFocus required maxLength={120} value={form.name} onChange={event => set("name", event.target.value)}
              placeholder="e.g. Northstar Plumbing"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Trade or service</label>
            <input aria-label="Contractor trade or service" required maxLength={120} value={form.trade} onChange={event => set("trade", event.target.value)}
              placeholder="e.g. Plumber, HVAC, electrician"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium outline-none focus:border-primary" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone <span className="font-normal normal-case">(optional)</span></label>
            <input aria-label="Contractor phone" inputMode="tel" maxLength={40} value={form.phone} onChange={event => set("phone", event.target.value)}
              placeholder="(555) 555-5555"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Email <span className="font-normal normal-case">(optional)</span></label>
            <input aria-label="Contractor email" type="email" maxLength={254} value={form.email} onChange={event => set("email", event.target.value)}
              placeholder="service@example.com"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Past work <span className="font-normal normal-case">(optional)</span></label>
          <textarea aria-label="Contractor past work" maxLength={1600} rows={2} value={form.pastWork} onChange={event => set("pastWork", event.target.value)}
            placeholder="e.g. Repaired the cabin water heater in 2025"
            className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes <span className="font-normal normal-case">(optional)</span></label>
          <textarea aria-label="Contractor notes" maxLength={1200} rows={3} value={form.notes} onChange={event => set("notes", event.target.value)}
            placeholder="Pricing, availability, specialty, or anything else useful…"
            className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm font-semibold">
          <input type="checkbox" checked={form.preferred} onChange={event => set("preferred", event.target.checked)} className="h-4 w-4 accent-primary" />
          <Star className={`h-4 w-4 ${form.preferred ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          Preferred contractor
        </label>
      </div>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold hover:bg-muted">Cancel</button>
        <button type="submit" disabled={saving || !form.name.trim() || !form.trade.trim()} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : initial.name ? "Save changes" : "Add contractor"}
        </button>
      </div>
    </form>
  );
}

function ContractorCard({ contractor, onEdit, onDelete }: { contractor: Contractor; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-bold text-base">{contractor.name}</h3>
              {contractor.preferred && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-label="Preferred contractor" />}
            </div>
            <p className="mt-0.5 text-sm font-semibold text-primary">{contractor.trade}</p>
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button onClick={onEdit} title={`Edit ${contractor.name}`} aria-label={`Edit ${contractor.name}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={onDelete} title={`Remove ${contractor.name}`} aria-label={`Remove ${contractor.name}`} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {(contractor.phone || contractor.email) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {contractor.phone && <a href={`tel:${contractor.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"><Phone className="h-3 w-3" /> Call</a>}
            {contractor.email && <a href={`mailto:${contractor.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"><Mail className="h-3 w-3" /> Email</a>}
          </div>
        )}
        {contractor.pastWork && <p className="mt-3 border-t border-border/70 pt-3 text-sm leading-relaxed text-muted-foreground"><span className="font-bold text-foreground">Past work:</span> {contractor.pastWork}</p>}
        {contractor.notes && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{contractor.notes}</p>}
      </CardContent>
    </Card>
  );
}

export default function People() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { preferences } = usePreferences();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("All people");
  const [form, setForm] = useState<PersonFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [contractorsLoading, setContractorsLoading] = useState(true);
  const [contractorForm, setContractorForm] = useState<ContractorFormState | null>(null);
  const [editingContractorId, setEditingContractorId] = useState<string | null>(null);
  const [savingContractor, setSavingContractor] = useState(false);
  const [problem, setProblem] = useState("");
  const [matches, setMatches] = useState<Contractor[] | null>(null);
  const [matching, setMatching] = useState(false);

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

  const loadContractors = useCallback(async () => {
    try {
      const response = await fetch("/api/contractors");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load contractors");
      setContractors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load contractors");
    } finally {
      setContractorsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      setContractorsLoading(false);
      return;
    }

    let cancelled = false;
    const initializeAndLoad = async () => {
      try {
        const profileResponse = await fetch("/api/me", { credentials: "include" });
        const profileData = await profileResponse.json();
        if (!profileResponse.ok) {
          throw new Error(profileData.error ?? "Unable to initialize household access");
        }
        if (!cancelled) await Promise.all([loadPeople(), loadContractors()]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to initialize household access");
          setLoading(false);
          setContractorsLoading(false);
        }
      }
    };
    void initializeAndLoad();

    return () => {
      cancelled = true;
    };
  }, [authLoaded, isSignedIn, loadContractors, loadPeople]);

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
    setForm({
      name: person.name,
      groups: person.groups,
      photoUrl: person.photoUrl ?? "",
      phone: person.phone ?? "",
      email: person.email ?? "",
      notes: person.notes ?? "",
      lastContactedAt: person.lastContactedAt ?? "",
      nextFollowUpAt: person.nextFollowUpAt ?? "",
    });
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

  const dueFollowUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return people.filter(person => person.nextFollowUpAt && person.nextFollowUpAt <= today)
      .sort((a, b) => (a.nextFollowUpAt ?? "").localeCompare(b.nextFollowUpAt ?? ""));
  }, [people]);

  const startAddContractor = () => {
    setEditingContractorId(null);
    setContractorForm(emptyContractorForm());
  };

  const startEditContractor = (contractor: Contractor) => {
    setEditingContractorId(contractor.id);
    setContractorForm({
      name: contractor.name,
      trade: contractor.trade,
      phone: contractor.phone ?? "",
      email: contractor.email ?? "",
      notes: contractor.notes ?? "",
      pastWork: contractor.pastWork ?? "",
      preferred: contractor.preferred,
    });
  };

  const saveContractor = async (values: ContractorFormState) => {
    setSavingContractor(true);
    try {
      const response = await fetch(editingContractorId ? `/api/contractors/${editingContractorId}` : "/api/contractors", {
        method: editingContractorId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save contractor");
      setContractors(current => {
        const updated = editingContractorId
          ? current.map(contractor => contractor.id === editingContractorId ? data : contractor)
          : [...current, data];
        return [...updated].sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name));
      });
      setContractorForm(null);
      setEditingContractorId(null);
      setError("");
      setMatches(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save contractor");
    } finally {
      setSavingContractor(false);
    }
  };

  const deleteContractor = async (contractor: Contractor) => {
    if (!confirm(`Remove ${contractor.name} from Contractors?`)) return;
    const response = await fetch(`/api/contractors/${contractor.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Unable to remove contractor");
      return;
    }
    setContractors(current => current.filter(item => item.id !== contractor.id));
    setMatches(current => current?.filter(item => item.id !== contractor.id) ?? null);
  };

  const findContractor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!problem.trim()) return;
    setMatching(true);
    try {
      const response = await fetch("/api/contractors/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to search contractors");
      setMatches(data.matches);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to search contractors");
    } finally {
      setMatching(false);
    }
  };

  if (!authLoaded) {
    return <div className="mx-auto max-w-5xl space-y-6 animate-pulse"><div className="h-12 w-48 rounded-xl bg-muted" /><div className="h-64 rounded-2xl bg-muted" /></div>;
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center rounded-3xl border border-primary/20 bg-primary/5 px-8 text-center">
        <UsersRound className="h-9 w-9 text-primary" />
        <h1 className="mt-4 font-serif text-3xl font-bold">Your household people, kept private</h1>
        <p className="mt-3 text-muted-foreground">Sign in to view and manage contact details, follow-ups, and trusted contractors for your household.</p>
        <Link href="/sign-in" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90">Sign in to HomeHub</Link>
      </div>
    );
  }

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

      {dueFollowUps.length > 0 && (
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h2 className="font-bold">Follow-up due</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{dueFollowUps.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {dueFollowUps.map(person => (
              <button key={person.id} onClick={() => startEdit(person)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm font-semibold hover:border-primary/40">
                <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {person.photoUrl ? <img src={person.photoUrl} alt="" className="h-full w-full object-cover" /> : initials(person.name)}
                </span>
                {person.name}
                <span className={`text-xs ${person.nextFollowUpAt! < new Date().toISOString().slice(0, 10) ? "text-destructive" : "text-primary"}`}>{followUpLabel(person.nextFollowUpAt)}</span>
              </button>
            ))}
          </div>
        </section>
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
        <div className={`grid gap-3 sm:grid-cols-2 ${preferences.tabs.people.layout === "cards" ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
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
        <div className={`grid gap-3 sm:grid-cols-2 ${preferences.tabs.people.layout === "cards" ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {filteredPeople.map(person => (
            <PersonCard key={person.id} person={person} onEdit={() => startEdit(person)} onDelete={() => deletePerson(person)} />
          ))}
        </div>
      )}

      <section className="border-t border-border pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <h2 className="font-serif text-3xl font-bold tracking-tight">Contractors</h2>
            </div>
            <p className="mt-1 text-sm font-medium text-muted-foreground">Remember trusted home-service professionals and find the right one fast.</p>
          </div>
          <button onClick={startAddContractor} className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background shadow-sm hover:bg-foreground/90">
            <Plus className="h-4 w-4" /> Add contractor
          </button>
        </div>

        <form onSubmit={findContractor} className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <label className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Search className="h-4 w-4 text-primary" /> What problem do you need help with?
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={problem} onChange={event => setProblem(event.target.value)}
              placeholder="e.g. The cabin water heater is leaking"
              className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
            <button type="submit" disabled={matching || !problem.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {matching ? "Finding…" : "Find a contractor"}
            </button>
          </div>
        </form>

        {matches !== null && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">{matches.length ? "Best matches" : "No match found"}</h3>
              <button onClick={() => setMatches(null)} className="text-xs font-bold text-muted-foreground hover:text-foreground">Clear results</button>
            </div>
            {matches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                No saved contractor seems to match that problem yet. Add a contractor with their trade, past work, or specialty to make future searches smarter.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {matches.map(contractor => <ContractorCard key={contractor.id} contractor={contractor} onEdit={() => startEditContractor(contractor)} onDelete={() => deleteContractor(contractor)} />)}
              </div>
            )}
          </div>
        )}

        {contractorForm && (
          <div className="mt-5">
            <ContractorForm initial={contractorForm} onSave={saveContractor}
              onCancel={() => { setContractorForm(null); setEditingContractorId(null); }}
              saving={savingContractor} />
          </div>
        )}

        <div className="mt-5">
          {contractorsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map(item => <div key={item} className="h-40 animate-pulse rounded-2xl bg-muted" />)}
            </div>
          ) : contractors.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></div>
              <h3 className="font-serif text-xl font-bold">Build your contractor memory bank</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Save plumbers, electricians, cleaners, and any service provider your household has used.</p>
              <button onClick={startAddContractor} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> Add your first contractor</button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {contractors.map(contractor => <ContractorCard key={contractor.id} contractor={contractor} onEdit={() => startEditContractor(contractor)} onDelete={() => deleteContractor(contractor)} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}