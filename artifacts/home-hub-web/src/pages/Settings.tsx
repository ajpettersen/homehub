import React, { useState } from "react";
import {
  useGetFamilyMembers,
  useCreateFamilyMember,
  useUpdateFamilyMember,
  useDeleteFamilyMember,
  useGetProperties,
  getGetFamilyMembersQueryKey,
  getGetPropertiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Settings as SettingsIcon, Home, Users, Plus, Pencil, Trash2, X, Check } from "lucide-react";

// ── colour palette for the picker ───────────────────────────────────────────
const COLORS = [
  "#C1440E", // terracotta
  "#2D6A4F", // sage
  "#E07B39", // amber
  "#4A90D9", // sky
  "#9B59B6", // violet
  "#E74C3C", // red
  "#2ECC71", // green
  "#F39C12", // gold
  "#1ABC9C", // teal
  "#E91E8C", // pink
  "#607D8B", // slate
  "#795548", // brown
];

const ROLES = ["parent", "child", "pet"] as const;
type Role = typeof ROLES[number];

interface MemberFormState {
  name: string;
  role: Role;
  color: string;
}

const defaultForm = (): MemberFormState => ({ name: "", role: "child", color: COLORS[0] });

// ── small colour swatch picker ───────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 transition-transform ${
            value === c ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

// ── member form (shared by add + edit) ──────────────────────────────────────
function MemberForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: MemberFormState;
  onSave: (data: MemberFormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<MemberFormState>(initial);
  const set = (k: keyof MemberFormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSave(form); }}
      className="space-y-4 bg-card border-2 border-primary/30 rounded-2xl p-5 shadow-md"
    >
      {/* Name */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Name</label>
        <input
          autoFocus
          required
          value={form.name}
          onChange={e => set("name", e.target.value)}
          className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="e.g. Alex"
        />
      </div>

      {/* Role */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Role</label>
        <div className="flex gap-2">
          {ROLES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => set("role", r)}
              className={`flex-1 py-2 rounded-xl font-bold text-sm capitalize transition-all border-2 ${
                form.role === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Color</label>
        <ColorPicker value={form.color} onChange={c => set("color", c)} />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 font-bold rounded-xl border-2 border-border text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// ── member card ──────────────────────────────────────────────────────────────
function MemberCard({
  member,
  onEdit,
  onDelete,
}: {
  member: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="bg-card group relative overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-inner shrink-0"
          style={{ backgroundColor: member.color || "var(--color-primary)" }}
        >
          {member.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg leading-tight truncate">{member.name}</h3>
          <p className="text-sm text-muted-foreground capitalize">{member.role}</p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onEdit}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function Settings() {
  const queryClient = useQueryClient();

  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });

  const createMember = useCreateFamilyMember();
  const updateMember = useUpdateFamilyMember();
  const deleteMember = useDeleteFamilyMember();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });

  const handleAdd = (data: MemberFormState) => {
    createMember.mutate(
      { data },
      {
        onSuccess: () => {
          invalidate();
          setAdding(false);
        },
      }
    );
  };

  const handleEdit = (id: string, data: MemberFormState) => {
    updateMember.mutate(
      { id, data },
      {
        onSuccess: () => {
          invalidate();
          setEditingId(null);
        },
      }
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Remove ${name} from your household? This can't be undone.`)) return;
    deleteMember.mutate(
      { id },
      { onSuccess: invalidate }
    );
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-4xl font-serif font-bold flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-muted-foreground" /> Settings
        </h1>
        <p className="text-muted-foreground mt-2">Manage your household configuration.</p>
      </div>

      <div className="space-y-8">
        {/* Family Members */}
        <section>
          <div className="flex items-center justify-between border-b-2 border-border pb-2 mb-6">
            <h2 className="text-2xl font-serif font-semibold flex items-center gap-2">
              <Users className="w-6 h-6" /> Family Members
            </h2>
            {!adding && (
              <button
                onClick={() => { setAdding(true); setEditingId(null); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
              >
                <Plus className="w-4 h-4" /> Add Member
              </button>
            )}
          </div>

          {adding && (
            <div className="mb-6">
              <MemberForm
                initial={defaultForm()}
                onSave={handleAdd}
                onCancel={() => setAdding(false)}
                saving={createMember.isPending}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {familyMembers?.map(member => (
              editingId === member.id ? (
                <div key={member.id} className="sm:col-span-2 md:col-span-3">
                  <MemberForm
                    initial={{ name: member.name, role: member.role as Role, color: member.color }}
                    onSave={data => handleEdit(member.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={updateMember.isPending}
                  />
                </div>
              ) : (
                <MemberCard
                  key={member.id}
                  member={member}
                  onEdit={() => { setEditingId(member.id); setAdding(false); }}
                  onDelete={() => handleDelete(member.id, member.name)}
                />
              )
            ))}
          </div>
        </section>

        {/* Properties (display-only for now) */}
        <section>
          <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2 mb-6 flex items-center gap-2">
            <Home className="w-6 h-6" /> Properties
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {properties?.map(property => (
              <Card key={property.id} className="bg-card">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">
                    {property.icon || "🏠"}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">{property.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{property.type}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
