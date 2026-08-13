import React, { useState } from "react";
import {
  useGetFamilyMembers, useCreateFamilyMember, useUpdateFamilyMember, useDeleteFamilyMember,
  useGetProperties, useUpdateProperty,
  getGetFamilyMembersQueryKey, getGetPropertiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Settings as SettingsIcon, Home, Users, Plus, Pencil, Trash2, X, Check,
  MapPin, Image, Mountain
} from "lucide-react";

// ── colour palette ───────────────────────────────────────────────────────────
const COLORS = [
  "#C1440E","#2D6A4F","#E07B39","#4A90D9","#9B59B6",
  "#E74C3C","#2ECC71","#F39C12","#1ABC9C","#E91E8C","#607D8B","#795548",
];
const ROLES = ["parent", "child", "pet"] as const;
type Role = typeof ROLES[number];

interface MemberFormState { name: string; role: Role; color: string; photoUrl: string; }
interface PropertyFormState { name: string; address: string; }

const defaultMemberForm = (): MemberFormState => ({ name: "", role: "child", color: COLORS[0], photoUrl: "" });

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

// ── member form ──────────────────────────────────────────────────────────────
function MemberForm({ initial, onSave, onCancel, saving }: {
  initial: MemberFormState; onSave: (d: MemberFormState) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState<MemberFormState>(initial);
  const set = (k: keyof MemberFormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }}
      className="space-y-4 bg-card border-2 border-primary/30 rounded-2xl p-5 shadow-md">

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

      <div className="flex gap-3 pt-2">
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

// ── member card ──────────────────────────────────────────────────────────────
function MemberCard({ member, onEdit, onDelete }: { member: any; onEdit: () => void; onDelete: () => void; }) {
  return (
    <Card className="bg-card group relative overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        {member.photoUrl ? (
          <img src={member.photoUrl} alt={member.name}
            className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-border"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-inner shrink-0"
            style={{ backgroundColor: member.color || "var(--color-primary)" }}>
            {member.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg leading-tight truncate">{member.name}</h3>
          <p className="text-sm text-muted-foreground capitalize">{member.role}</p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Edit">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── property form ────────────────────────────────────────────────────────────
function PropertyForm({ initial, propertyType, onSave, onCancel, saving }: {
  initial: PropertyFormState; propertyType: string; onSave: (d: PropertyFormState) => void;
  onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState<PropertyFormState>(initial);
  const set = (k: keyof PropertyFormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }}
      className="space-y-4 bg-card border-2 border-primary/30 rounded-2xl p-5 shadow-md">

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Property Name</label>
        <input autoFocus required value={form.name} onChange={e => set("name", e.target.value)}
          className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:border-primary"
          placeholder={propertyType === "cabin" ? "Cabin" : "Main House"} />
      </div>

      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Address <span className="font-normal normal-case text-muted-foreground">(for Street View thumbnail)</span>
        </label>
        <input value={form.address} onChange={e => set("address", e.target.value)}
          className="w-full bg-background border-2 border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-primary"
          placeholder="123 Main St, Minnetonka, MN 55305" />
        <p className="text-xs text-muted-foreground mt-1.5">Used to pull a Google Street View photo of the property.</p>
      </div>

      <div className="flex gap-3 pt-2">
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

// ── property card ────────────────────────────────────────────────────────────
function PropertyCard({ property, onEdit }: { property: any; onEdit: () => void; }) {
  const baseUrl = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const streetViewSrc = `${baseUrl}/api/properties/${property.id}/streetview`;
  const [imgError, setImgError] = useState(false);
  const isCabin = property.type === "cabin";

  return (
    <Card className="bg-card group overflow-hidden">
      {/* Street view thumbnail */}
      <div className="relative w-full h-40 bg-muted overflow-hidden">
        {property.address && !imgError ? (
          <img
            src={streetViewSrc}
            alt={`Street view of ${property.name}`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/50">
            {isCabin
              ? <Mountain className="w-10 h-10 text-muted-foreground/40" />
              : <Home className="w-10 h-10 text-muted-foreground/40" />}
            <span className="text-xs text-muted-foreground/60 font-medium">
              {property.address ? "Street view unavailable" : "Add address for photo"}
            </span>
          </div>
        )}
        <button
          onClick={onEdit}
          className="absolute top-2 right-2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
          title="Edit property"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      <CardContent className="p-4">
        <h3 className="font-bold text-lg leading-tight">{property.name}</h3>
        {property.address
          ? <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{property.address}</p>
          : <button onClick={onEdit} className="text-sm text-primary/70 hover:text-primary mt-0.5 flex items-center gap-1 transition-colors">
              <MapPin className="w-3 h-3 shrink-0" /> Add address…
            </button>
        }
        <p className="text-xs text-muted-foreground/60 capitalize mt-1">{property.type}</p>
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
  const updateProperty = useUpdateProperty();

  const [adding, setAdding] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);

  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });
  const invalidateProps = () => queryClient.invalidateQueries({ queryKey: getGetPropertiesQueryKey() });

  const handleAddMember = (data: MemberFormState) => {
    createMember.mutate(
      { data: { name: data.name, role: data.role, color: data.color, photoUrl: data.photoUrl || null } },
      { onSuccess: () => { invalidateMembers(); setAdding(false); } }
    );
  };

  const handleEditMember = (id: string, data: MemberFormState) => {
    updateMember.mutate(
      { id, data: { name: data.name, role: data.role, color: data.color, photoUrl: data.photoUrl || null } },
      { onSuccess: () => { invalidateMembers(); setEditingMemberId(null); } }
    );
  };

  const handleDeleteMember = (id: string, name: string) => {
    if (!confirm(`Remove ${name} from your household? This can't be undone.`)) return;
    deleteMember.mutate({ id }, { onSuccess: invalidateMembers });
  };

  const handleEditProperty = (id: string, data: PropertyFormState) => {
    updateProperty.mutate(
      { id, data: { name: data.name, address: data.address || null } },
      { onSuccess: () => { invalidateProps(); setEditingPropertyId(null); } }
    );
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-4xl font-serif font-bold flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-muted-foreground" /> Settings
        </h1>
        <p className="text-muted-foreground mt-2">Manage your household configuration.</p>
      </div>

      {/* ── Properties ── */}
      <section>
        <div className="flex items-center justify-between border-b-2 border-border pb-2 mb-6">
          <h2 className="text-2xl font-serif font-semibold flex items-center gap-2">
            <Home className="w-6 h-6" /> Properties
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Add an address to each property to show a Google Street View photo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {properties?.map(property =>
            editingPropertyId === property.id ? (
              <div key={property.id} className="sm:col-span-2">
                <PropertyForm
                  initial={{ name: property.name, address: property.address ?? "" }}
                  propertyType={property.type}
                  onSave={data => handleEditProperty(property.id, data)}
                  onCancel={() => setEditingPropertyId(null)}
                  saving={updateProperty.isPending}
                />
              </div>
            ) : (
              <PropertyCard key={property.id} property={property} onEdit={() => { setEditingPropertyId(property.id); }} />
            )
          )}
        </div>
        {!properties?.every(p => p.address) && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>Street View needs a Google Maps API key.</strong> Once you add addresses above and configure the key, photos will appear automatically on this page and on the Properties tab.
          </div>
        )}
      </section>

      {/* ── Family Members ── */}
      <section>
        <div className="flex items-center justify-between border-b-2 border-border pb-2 mb-6">
          <h2 className="text-2xl font-serif font-semibold flex items-center gap-2">
            <Users className="w-6 h-6" /> Family Members
          </h2>
          {!adding && (
            <button onClick={() => { setAdding(true); setEditingMemberId(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              <Plus className="w-4 h-4" /> Add Member
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-6">
            <MemberForm initial={defaultMemberForm()} onSave={handleAddMember}
              onCancel={() => setAdding(false)} saving={createMember.isPending} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {familyMembers?.map(member =>
            editingMemberId === member.id ? (
              <div key={member.id} className="sm:col-span-2 md:col-span-3">
                <MemberForm
                  initial={{ name: member.name, role: member.role as Role, color: member.color, photoUrl: member.photoUrl ?? "" }}
                  onSave={data => handleEditMember(member.id, data)}
                  onCancel={() => setEditingMemberId(null)}
                  saving={updateMember.isPending}
                />
              </div>
            ) : (
              <MemberCard key={member.id} member={member}
                onEdit={() => { setEditingMemberId(member.id); setAdding(false); }}
                onDelete={() => handleDeleteMember(member.id, member.name)} />
            )
          )}
        </div>
      </section>
    </div>
  );
}
