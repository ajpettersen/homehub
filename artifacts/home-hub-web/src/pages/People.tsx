import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { Link } from "wouter";
import { usePreferences } from "@/context/PreferencesContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPeople, getGetPeopleQueryKey, useCreatePerson, useUpdatePerson, useDeletePerson,
  useGetContractors, getGetContractorsQueryKey, useCreateContractor, useUpdateContractor, useDeleteContractor, useMatchContractors,
  type Person, type Contractor
} from "@workspace/api-client-react";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
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
  error,
}: {
  initial: PersonFormState;
  availableGroups: string[];
  onSave: (form: PersonFormState) => void;
  onCancel: () => void;
  saving: boolean;
  error?: string | null;
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

      {error && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p>}
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
  const followUp = followUpLabel(person.nextFollowUpAt ?? null);
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
  error,
}: {
  initial: ContractorFormState;
  onSave: (form: ContractorFormState) => void;
  onCancel: () => void;
  saving: boolean;
  error?: string | null;
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
      {error && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p>}
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
  const queryClient = useQueryClient();

  const { data: people = [], isLoading: loadingPeople, isError: isPeopleError, error: peopleErrorObj, refetch: refetchPeople } = useGetPeople({
    query: { queryKey: getGetPeopleQueryKey(), enabled: !!isSignedIn }
  });
  const { data: contractors = [], isLoading: loadingContractors, isError: isContractorsError, error: contractorsErrorObj, refetch: refetchContractors } = useGetContractors(undefined, { query: { queryKey: getGetContractorsQueryKey(), enabled: !!isSignedIn } });

  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePersonMutation = useDeletePerson();
  const createContractor = useCreateContractor();
  const updateContractor = useUpdateContractor();
  const deleteContractorMutation = useDeleteContractor();
  const matchContractors = useMatchContractors();

  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("All people");
  const [form, setForm] = useState<PersonFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [contractorForm, setContractorForm] = useState<ContractorFormState | null>(null);
  const [editingContractorId, setEditingContractorId] = useState<string | null>(null);

  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);
  const [deletePersonError, setDeletePersonError] = useState<string | null>(null);

  const [deletingContractor, setDeletingContractor] = useState<Contractor | null>(null);
  const [deleteContractorError, setDeleteContractorError] = useState<string | null>(null);

  const [problem, setProblem] = useState("");
  const [matches, setMatches] = useState<Contractor[] | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

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
    setActionError(null);
    setEditingId(null);
    setForm(emptyForm());
  };

  const startEdit = (person: Person) => {
    setActionError(null);
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
    setActionError(null);
    try {
      if (editingId) {
        await updatePerson.mutateAsync({ id: editingId, data: values });
      } else {
        await createPerson.mutateAsync({ data: values });
      }
      await queryClient.invalidateQueries({ queryKey: getGetPeopleQueryKey() });
      setForm(null);
      setEditingId(null);
    } catch (err) {
      setActionError((err as any)?.data?.error || (err instanceof Error ? err.message : "Unable to save person"));
    }
  };

  const deletePerson = (person: Person) => {
    setDeletingPerson(person);
    setDeletePersonError(null);
  };

  const performDeletePerson = async () => {
    if (!deletingPerson) return;
    setDeletePersonError(null);
    try {
      await deletePersonMutation.mutateAsync({ id: deletingPerson.id });
      await queryClient.invalidateQueries({ queryKey: getGetPeopleQueryKey() });
      setDeletingPerson(null);
    } catch (err) {
      setDeletePersonError((err as any)?.data?.error || (err instanceof Error ? err.message : "Unable to remove person"));
    }
  };

  const dueFollowUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return people.filter(person => person.nextFollowUpAt && person.nextFollowUpAt <= today)
      .sort((a, b) => (a.nextFollowUpAt ?? "").localeCompare(b.nextFollowUpAt ?? ""));
  }, [people]);

  const startAddContractor = () => {
    setActionError(null);
    setEditingContractorId(null);
    setContractorForm(emptyContractorForm());
  };

  const startEditContractor = (contractor: Contractor) => {
    setActionError(null);
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
    setActionError(null);
    try {
      if (editingContractorId) {
        await updateContractor.mutateAsync({ id: editingContractorId, data: values });
      } else {
        await createContractor.mutateAsync({ data: values });
      }
      await queryClient.invalidateQueries({ queryKey: getGetContractorsQueryKey() });
      setContractorForm(null);
      setEditingContractorId(null);
      setMatches(null);
    } catch (err) {
      setActionError((err as any)?.data?.error || (err instanceof Error ? err.message : "Unable to save contractor"));
    }
  };

  const deleteContractor = (contractor: Contractor) => {
    setDeletingContractor(contractor);
    setDeleteContractorError(null);
  };

  const performDeleteContractor = async () => {
    if (!deletingContractor) return;
    setDeleteContractorError(null);
    try {
      await deleteContractorMutation.mutateAsync({ id: deletingContractor.id });
      await queryClient.invalidateQueries({ queryKey: getGetContractorsQueryKey() });
      setMatches(current => current?.filter(item => item.id !== deletingContractor.id) ?? null);
      setDeletingContractor(null);
    } catch (err) {
      setDeleteContractorError((err as any)?.data?.error || (err instanceof Error ? err.message : "Unable to remove contractor"));
    }
  };

  const findContractor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!problem.trim()) return;
    setActionError(null);
    try {
      const data = await matchContractors.mutateAsync({ data: { problem } });
      setMatches(data.matches);
    } catch (err) {
      setActionError((err as any)?.data?.error || (err instanceof Error ? err.message : "Unable to search contractors"));
    }
  };

  if (!authLoaded) {
    return <div className="mx-auto max-w-5xl space-y-6 animate-pulse"><div className="h-12 w-48 rounded-xl bg-muted" /><div className="h-64 rounded-2xl bg-muted" /></div>;
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-5xl text-center py-20">
        <h1 className="font-serif text-3xl font-bold">Please sign in</h1>
        <p className="mt-2 text-muted-foreground">You must be signed in to view your household people.</p>
      </div>
    );
  }

  if (loadingPeople || loadingContractors) {
    return <div className="mx-auto max-w-5xl space-y-6 animate-pulse"><div className="h-12 w-48 rounded-xl bg-muted" /><div className="h-64 rounded-2xl bg-muted" /></div>;
  }

  const isError = isPeopleError || isContractorsError;
  const combinedError = (peopleErrorObj as Error)?.message || (contractorsErrorObj as Error)?.message || "Unable to load data";

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl text-center py-20">
        <h1 className="font-serif text-3xl font-bold text-destructive">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">{combinedError}</p>
        <button onClick={() => { refetchPeople(); refetchContractors(); }} className="mt-4 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">Try again</button>
      </div>
    );
  }

  const showDirectory = preferences.tabs.people.layout === "compact";

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <header>
        <h1 className="font-serif text-4xl font-bold text-foreground">People</h1>
        <p className="mt-2 text-lg text-muted-foreground">Keep track of friends, neighbors, and trusted contractors.</p>
      </header>

      {actionError && !form && !contractorForm && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive flex items-center justify-between">
          {actionError}
          <button onClick={() => setActionError(null)} className="text-destructive hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {dueFollowUps.length > 0 && (
        <section>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">Follow-ups due</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dueFollowUps.map(person => (
              <PersonCard key={person.id} person={person} onEdit={() => startEdit(person)} onDelete={() => deletePerson(person)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-bold text-foreground">Family & Friends</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Everyone connected to your household.</p>
          </div>
          <button onClick={startAdd} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" /> Add person
          </button>
        </div>

        {form && (
          <div className="mb-6">
            <PersonForm
              initial={form}
              availableGroups={groups}
              onSave={savePerson}
              onCancel={() => { setForm(null); setActionError(null); }}
              saving={createPerson.isPending || updatePerson.isPending}
              error={actionError}
            />
          </div>
        )}

        {people.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search names, notes…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-4 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {["All people", ...groups].map(group => (
                <button
                  key={group}
                  onClick={() => setActiveGroup(group)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeGroup === group ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>
        )}

        {people.length === 0 && !form ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <UserRound className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-4 font-bold text-foreground">No people added yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Keep track of neighbors, teachers, or friends.</p>
            <button onClick={startAdd} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Add person
            </button>
          </div>
        ) : filteredPeople.length === 0 && !form ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No people match your search.
          </div>
        ) : showDirectory ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="divide-y divide-border">
              {filteredPeople.map(person => (
                <div key={person.id} className="group flex items-center justify-between gap-4 p-4 hover:bg-muted/30">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {person.photoUrl ? <img src={person.photoUrl} alt={person.name} className="h-full w-full object-cover" /> : initials(person.name) || <UserRound className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-sm">{person.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{person.groups.join(", ") || "No group"}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="hidden sm:flex gap-1">
                      {person.phone && <a href={`tel:${person.phone}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Phone className="h-4 w-4" /></a>}
                      {person.email && <a href={`mailto:${person.email}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Mail className="h-4 w-4" /></a>}
                    </div>
                    <button onClick={() => startEdit(person)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover:opacity-100 focus:opacity-100"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => deletePerson(person)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPeople.map(person => (
              <PersonCard key={person.id} person={person} onEdit={() => startEdit(person)} onDelete={() => deletePerson(person)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-bold text-foreground">Trusted Contractors</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Plumbers, electricians, and services you’d hire again.</p>
          </div>
          <button onClick={startAddContractor} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" /> Add contractor
          </button>
        </div>

        {contractorForm && (
          <div className="mb-6">
            <ContractorForm
              initial={contractorForm}
              onSave={saveContractor}
              onCancel={() => { setContractorForm(null); setActionError(null); }}
              saving={createContractor.isPending || updateContractor.isPending}
              error={actionError}
            />
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-bold text-foreground">Find a contractor</h3>
          <p className="mt-1 text-sm text-muted-foreground">Describe your project and we’ll match you with the best saved contractor.</p>
          <form onSubmit={findContractor} className="mt-3 flex gap-2">
            <input
              value={problem}
              onChange={event => setProblem(event.target.value)}
              placeholder="e.g. The water heater is leaking"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <button type="submit" disabled={matchContractors.isPending || !problem.trim()} className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background transition-colors hover:bg-foreground/90 disabled:opacity-50">
              {matchContractors.isPending ? "Searching…" : "Search"}
            </button>
          </form>
          {matches && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <h4 className="font-bold text-primary">Best matches</h4>
              {matches.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No contractors match this project.</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {matches.map(contractor => (
                    <ContractorCard key={contractor.id} contractor={contractor} onEdit={() => startEditContractor(contractor)} onDelete={() => deleteContractor(contractor)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {contractors.length === 0 && !contractorForm ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <Wrench className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-4 font-bold text-foreground">No contractors saved</h3>
            <p className="mt-1 text-sm text-muted-foreground">Save the people who keep your house running.</p>
            <button onClick={startAddContractor} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-muted">
              <Plus className="h-4 w-4" /> Add contractor
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contractors.map(contractor => (
              <ContractorCard key={contractor.id} contractor={contractor} onEdit={() => startEditContractor(contractor)} onDelete={() => deleteContractor(contractor)} />
            ))}
          </div>
        )}
      </section>

      <ConfirmActionDialog
        open={!!deletingPerson}
        onOpenChange={(open) => !open && setDeletingPerson(null)}
        title="Remove person?"
        description={`Are you sure you want to remove ${deletingPerson?.name}? This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={performDeletePerson}
        pending={deletePersonMutation.isPending}
        error={deletePersonError}
        destructive
      />

      <ConfirmActionDialog
        open={!!deletingContractor}
        onOpenChange={(open) => !open && setDeletingContractor(null)}
        title="Remove contractor?"
        description={`Are you sure you want to remove ${deletingContractor?.name}? This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={performDeleteContractor}
        pending={deleteContractorMutation.isPending}
        error={deleteContractorError}
        destructive
      />
    </div>
  );
}
