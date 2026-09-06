import React, { useState, useRef } from "react";
import { Loader2, Plus, Trash2, Box } from "lucide-react";
import { useGetInventory, useAddInventoryItem, useDeleteInventoryItem, type KitchenInventoryItem } from "@/hooks/useKitchenInventory";

const ALL_CATEGORIES: Record<string, { label: string }> = {
  produce:   { label: "Produce" },
  deli:      { label: "Deli & Lunch Meat" },
  meat:      { label: "Meat & Seafood" },
  dairy:     { label: "Dairy & Eggs" },
  bread:     { label: "Bread & Bakery" },
  grains:    { label: "Grains & Pasta" },
  canned:    { label: "Canned & Pantry" },
  snacks:    { label: "Snacks" },
  frozen:    { label: "Frozen" },
  beverages: { label: "Beverages" },
  household: { label: "Household" },
  other:     { label: "Other" },
};

const CATEGORY_OPTIONS = Object.entries(ALL_CATEGORIES).map(([key, { label }]) => ({
  key,
  label
}));

function resolveCategory(raw: string | null | undefined): string {
  const k = raw ?? "other";
  return ALL_CATEGORIES[k] ? k : "other";
}

export function InventorySection({ propertyId }: { propertyId: string }) {
  const { data: inventory, isLoading, isError } = useGetInventory(propertyId);
  const addItem = useAddInventoryItem();
  const deleteItem = useDeleteInventoryItem();

  const [addingOpen, setAddingOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("canned");
  const [newQty, setNewQty] = useState("");
  const [addError, setAddError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (addingOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [addingOpen]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddError("");
    try {
      await addItem.mutateAsync({
        propertyId,
        name: newName.trim(),
        category: newCategory,
        quantity: newQty.trim() || undefined,
      });
      setNewName("");
      setNewQty("");
      setAddingOpen(false);
    } catch (err: any) {
      setAddError(err.message || "Failed to add item");
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteError("");
    try {
      await deleteItem.mutateAsync({ id, propertyId });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "That inventory item could not be removed.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading inventory...
      </div>
    );
  }

  if (isError) {
    return <p role="alert" className="py-8 text-center text-sm font-medium text-destructive">The kitchen inventory could not be loaded. Please try again.</p>;
  }

  const items = inventory ?? [];
  const grouped = new Map<string, KitchenInventoryItem[]>();
  for (const item of items) {
    const cat = resolveCategory(item.category);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const aLabel = ALL_CATEGORIES[a[0]]?.label ?? "Other";
    const bLabel = ALL_CATEGORIES[b[0]]?.label ?? "Other";
    return aLabel.localeCompare(bLabel);
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Box className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-serif font-bold text-xl">Inventory</h2>
          <p className="text-sm text-muted-foreground">What's in your kitchen</p>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary/80">
        Inventory refreshes when you upload at least two kitchen photos in Plan My Week. Only detected ingredient names are kept; the photos are not saved.
      </div>
      {deleteError && <p role="alert" className="text-sm font-medium text-destructive">{deleteError}</p>}

      {addingOpen ? (
        <form onSubmit={handleAdd} className="bg-card p-3 rounded-2xl border-2 border-primary/20 shadow-sm space-y-3">
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Item name (e.g. Milk)"
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary font-medium"
          />
          <input
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            placeholder="Quantity (e.g. 1 gallon, optional)"
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary font-medium"
          />
          <details open>
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground mb-1">
              Category: {ALL_CATEGORIES[newCategory]?.label ?? "Other"}
            </summary>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CATEGORY_OPTIONS.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setNewCategory(cat.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${newCategory === cat.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </details>
          {addError && <p className="text-sm font-medium text-destructive">{addError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAddingOpen(false); setAddError(""); }} className="flex-1 py-2 rounded-xl border-2 border-border font-bold text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={addItem.isPending} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              Add item
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAddingOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-bold hover:bg-primary/5 hover:border-primary/50 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Item Manually
        </button>
      )}

      {items.length === 0 && !addingOpen && (
        <p className="text-muted-foreground text-sm text-center py-8 italic">Your inventory is empty.</p>
      )}

      <div className="space-y-6 mt-4">
        {sortedGroups.map(([cat, catItems]) => (
          <div key={cat}>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              {ALL_CATEGORIES[cat]?.label ?? "Other"}
            </p>
            <div className="space-y-1">
              {catItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-card rounded-xl border border-border/60 group hover:border-border transition-colors">
                  <span className="flex-1 text-sm font-medium">{item.name}</span>
                  {item.quantity && <span className="text-xs text-muted-foreground font-medium bg-muted px-2 py-1 rounded-md">{item.quantity}</span>}
                  <button onClick={() => void handleDelete(item.id)} disabled={deleteItem.isPending} aria-label={`Delete ${item.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-all hover:text-destructive disabled:opacity-40 sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
