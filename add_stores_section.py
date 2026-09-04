import re

with open("artifacts/home-hub-web/src/pages/Settings.tsx", "r") as f:
    content = f.read()

new_block = """
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
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Store Name</label>
        <input
          autoFocus
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Cub Foods - Minnetonka"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Address / Notes (Optional)</label>
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="e.g. 123 Main St"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>
      <label className="flex items-center gap-2">
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
                <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded bg-muted/50 hover:bg-muted transition-colors">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => moveDown(idx)} disabled={idx === departments.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed rounded bg-muted/50 hover:bg-muted transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <input
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetStoresQueryKey() });

  const handleAdd = (data: StoreInput) => {
    setErrorMsg(null);
    createStore.mutate(
      { data },
      {
        onSuccess: () => { invalidate(); setAdding(false); },
        onError: (err: any) => setErrorMsg(err.message || "Failed to add store")
      }
    );
  };

  const handleEdit = (id: string, data: StoreInput) => {
    setErrorMsg(null);
    updateStore.mutate(
      { id, data },
      {
        onSuccess: () => { invalidate(); setEditingId(null); },
        onError: (err: any) => setErrorMsg(err.message || "Failed to update store")
      }
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (stores?.length === 1) {
      setErrorMsg("Cannot delete the final store.");
      return;
    }
    if (!confirm(`Delete store "${name}"?`)) return;
    setErrorMsg(null);
    deleteStore.mutate(
      { id },
      {
        onSuccess: () => invalidate(),
        onError: (err: any) => setErrorMsg(err.message || "Failed to delete store")
      }
    );
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
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-bold flex items-center gap-2">
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
    </AccordionSection>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
"""

idx = content.find("// ── main page ─────────────────────────────────────────────────────────────────")
new_content = content[:idx] + new_block + content[idx + len("// ── main page ─────────────────────────────────────────────────────────────────"):]

with open("artifacts/home-hub-web/src/pages/Settings.tsx", "w") as f:
    f.write(new_content)
print("StoresSection added.")
