import re

with open("artifacts/home-hub-web/src/pages/Kitchen.tsx", "r") as f:
    content = f.read()

# 1. Update imports
imports_old = """  useGetMealRatings, getGetMealRatingsQueryKey,
  useUpsertMealRating, useDeleteMealRating,
  type FamilyMember, type MealRating,
} from "@workspace/api-client-react";"""
imports_new = """  useGetMealRatings, getGetMealRatingsQueryKey,
  useUpsertMealRating, useDeleteMealRating,
  type FamilyMember, type MealRating,
  useGetStores, getGetStoresQueryKey,
  useUpdateGroceryListStore,
  type HouseholdStore,
  type GroceryCategoryKey
} from "@workspace/api-client-react";"""
content = content.replace(imports_old, imports_new)

imports_old2 = """import { useActiveMember } from "@/context/ActiveMemberContext";"""
imports_new2 = """import { useActiveMember } from "@/context/ActiveMemberContext";
import { Link as RouterLink } from "wouter";"""
content = content.replace(imports_old2, imports_new2)

# 2. Remove STORE_PROFILES and useActiveStore
start_marker = "// Store profiles — ordered by physical store walk path"
end_marker = "type MealForShopping = { dayName: string; mealType: string; meal: string };"
if start_marker in content and end_marker in content:
    content = content[:content.find(start_marker)] + end_marker + content[content.find(end_marker) + len(end_marker):]

# 3. Modify GroceryListDetail body
new_func = """function GroceryListDetail({ list, meals }: { list: any; meals: MealForShopping[] }) {
  const queryClient = useQueryClient();
  const { data: stores, isLoading: storesLoading } = useGetStores({ query: { queryKey: getGetStoresQueryKey() } });
  const updateStore = useUpdateGroceryListStore();

  const activeStoreId = list.storeId ?? stores?.find(s => s.isDefault)?.id ?? stores?.[0]?.id;
  const store = stores?.find(s => s.id === activeStoreId);

  const { data: items } = useGetGroceryItems(list.id, { query: { queryKey: getGetGroceryItemsQueryKey(list.id) } });
  const addItem = useAddGroceryItem();
  const updateItem = useUpdateGroceryItem();
  const deleteItem = useDeleteGroceryItem();

  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("produce");
  const [newQty, setNewQty] = useState("");
  const [addingOpen, setAddingOpen] = useState(false);
  const [storePicker, setStorePicker] = useState(false);
  const [aiShoppingLoading, setAiShoppingLoading] = useState(false);
  const [aiShoppingError, setAiShoppingError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleBuildFromMeals = async () => {
    if (meals.length === 0) return;
    setAiShoppingLoading(true);
    setAiShoppingError(null);
    try {
      const res = await fetch(`/api/ai/shopping-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meals }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const data = await res.json() as { items: Array<{ name: string; quantity: string | null; category: string }> };
      if (!Array.isArray(data?.items)) return;

      const seenNames = new Set(
        (items ?? []).filter(i => !i.checked).map(i => i.name.toLowerCase().trim())
      );

      for (const item of data.items) {
        const key = item.name.toLowerCase().trim();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        await new Promise<void>((resolve) => {
          addItem.mutate(
            { id: list.id, data: { name: item.name, quantity: item.quantity ?? null, category: item.category } },
            { onSuccess: () => resolve(), onError: () => resolve() }
          );
        });
      }

      queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(list.id) });
      queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
    } catch (err) {
      console.error("Build from meals error:", err);
      setAiShoppingError("Failed to build list — please try again.");
    } finally {
      setAiShoppingLoading(false);
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(list.id) });
    queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    addItem.mutate(
      { id: list.id, data: { name: newItem.trim(), quantity: newQty || null, category: newCategory } },
      { onSuccess: () => { setNewItem(""); setNewQty(""); invalidate(); } }
    );
  };

  const handleCheck = (item: any) => {
    updateItem.mutate({ id: item.id, data: { checked: !item.checked } }, { onSuccess: invalidate });
  };

  const handleDelete = (id: string) => {
    deleteItem.mutate({ id }, { onSuccess: invalidate });
  };

  const handleSetStore = (storeId: string) => {
    updateStore.mutate(
      { id: list.id, data: { storeId } },
      { onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(list.id) });
      }}
    );
    setStorePicker(false);
  };

  if (storesLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading stores...
      </div>
    );
  }

  if (!stores || stores.length === 0 || !store) {
    return (
      <div className="flex flex-col items-center gap-3 text-muted-foreground py-12 justify-center">
        <Store className="w-8 h-8 opacity-50" />
        <p className="text-sm font-medium">No stores configured.</p>
        <RouterLink href="/settings" className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg shadow-sm hover:bg-primary/90 transition-colors">
          Add a Store in Settings
        </RouterLink>
      </div>
    );
  }

  const unchecked = items?.filter(i => !i.checked) ?? [];
  const checked   = items?.filter(i => i.checked)  ?? [];

  const storeDepartments = store.departments ?? [];
  const orderedKeys = storeDepartments.map(d => d.categoryKey);
  
  const bySection = storeDepartments
    .map(dept => {
      const key = dept.categoryKey;
      const emoji = ALL_CATEGORIES[key]?.emoji ?? "📦";
      return {
        key,
        label: dept.displayName,
        emoji,
        items: unchecked.filter(i => resolveCategory(i.category) === key),
      };
    })
    .filter(g => g.items.length > 0);

  const mappedKeys = new Set<string>(orderedKeys);
  const unmappedItems = unchecked.filter(i => !mappedKeys.has(resolveCategory(i.category)));
  if (unmappedItems.length > 0) {
    bySection.push({
      key: "other",
      label: "Other",
      emoji: "📦",
      items: unmappedItems,
    });
  }

  const categoryOptions = storeDepartments.map(dept => {
    const emoji = ALL_CATEGORIES[dept.categoryKey]?.emoji ?? "📦";
    return {
      key: dept.categoryKey,
      label: `${emoji} ${dept.displayName}`,
    };
  });

  return (
    <div className="space-y-4">
      {/* Build from meal plan */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={handleBuildFromMeals}
          disabled={aiShoppingLoading || meals.length === 0}
          title={meals.length === 0 ? "Add meals to your plan first" : "Generate a shopping list from this week's meals"}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {aiShoppingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {aiShoppingLoading ? "Building list from meals…" : "Build list from meal plan"}
        </button>
        {aiShoppingError && (
          <p className="text-xs text-destructive text-center">{aiShoppingError}</p>
        )}
        {meals.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">Switch to Meal Plan tab and add meals first.</p>
        )}
      </div>

      {/* Store picker */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setStorePicker(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/60 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Store className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground">{store.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {storePicker && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setStorePicker(false)} />
              <div className="absolute left-0 top-full mt-1 z-40 bg-card border border-border rounded-2xl shadow-lg p-1.5 min-w-[220px]">
                {stores.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSetStore(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${s.id === store.id ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted font-medium'}`}
                  >
                    {s.id === store.id && <Check className="w-3.5 h-3.5" />}
                    <span className={s.id === store.id ? "" : "ml-5"}>{s.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add form */}
      {addingOpen ? (
        <form onSubmit={handleAdd} className="bg-card p-3 rounded-2xl border-2 border-primary/20 shadow-sm space-y-3">
          <input
            ref={inputRef}
            autoFocus
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            placeholder="Item name (e.g. Apples)"
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary font-medium"
          />
          <input
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            placeholder="Quantity or note (e.g. 3 lbs, optional)"
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary font-medium"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {categoryOptions.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setNewCategory(cat.key as GroceryCategoryKey)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${newCategory === cat.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAddingOpen(false)} className="flex-1 py-2 rounded-xl border-2 border-border font-bold text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={addItem.isPending} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              Add to List
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAddingOpen(true)}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-bold hover:bg-primary/5 hover:border-primary/50 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
      )}

      {unchecked.length === 0 && checked.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8 italic">List is empty — add items above or plan your meals first.</p>
      )}

      {/* Sections in store walk order */}
      {bySection.map(group => (
        <div key={group.key}>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {group.emoji} {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-card rounded-xl border border-border/60 group hover:border-border transition-colors">
                <button
                  onClick={() => handleCheck(item)}
                  className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center shrink-0 hover:border-primary transition-colors"
                />
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                {item.quantity && <span className="text-xs text-muted-foreground font-medium">{item.quantity}</span>}
                <button onClick={() => handleDelete(item.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* In-cart / checked items */}
      {checked.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">✓ In Cart ({checked.length})</p>
          <div className="space-y-1">
            {checked.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-muted/30 rounded-xl border border-border/30 group opacity-60 hover:opacity-80 transition-opacity">
                <button
                  onClick={() => handleCheck(item)}
                  className="w-5 h-5 rounded-full bg-primary border-2 border-primary flex items-center justify-center shrink-0"
                >
                  <Check className="w-3 h-3 text-primary-foreground" />
                </button>
                <span className="flex-1 text-sm font-medium line-through text-muted-foreground">{item.name}</span>
                {item.quantity && <span className="text-xs text-muted-foreground">{item.quantity}</span>}
                <button onClick={() => handleDelete(item.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}"""

start_str = "function GroceryListDetail({ list, meals }: { list: any; meals: MealForShopping[] }) {"
end_str = "    </div>\n  );\n}"
idx1 = content.find(start_str)
idx2 = content.find(end_str, idx1)
if idx1 != -1 and idx2 != -1:
    content = content[:idx1] + new_func + content[idx2 + len(end_str):]

with open("artifacts/home-hub-web/src/pages/Kitchen.tsx", "w") as f:
    f.write(content)
