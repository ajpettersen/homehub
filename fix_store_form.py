import re

with open("artifacts/home-hub-web/src/pages/Settings.tsx", "r") as f:
    content = f.read()

new_form = """function StoreForm({ initial, onSave, onCancel, saving }: {
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
}"""

start_str = "function StoreForm({ initial, onSave, onCancel, saving }: {"
end_str = "    </form>\n  );\n}"
idx1 = content.find(start_str)
idx2 = content.find(end_str, idx1)
if idx1 != -1 and idx2 != -1:
    content = content[:idx1] + new_form + content[idx2 + len(end_str):]
    with open("artifacts/home-hub-web/src/pages/Settings.tsx", "w") as f:
        f.write(content)
    print("Fixed StoreForm.")
