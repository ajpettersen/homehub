import React, { useState, useRef } from "react";
import {
  useGetMealPlans, getGetMealPlansQueryKey,
  useCreateMealPlanEntry, useDeleteMealPlanEntry,
  useGetGroceryLists, getGetGroceryListsQueryKey,
  useCreateGroceryList, useDeleteGroceryList,
  useGetGroceryItems, getGetGroceryItemsQueryKey,
  useUpdateGroceryItem, useAddGroceryItem, useDeleteGroceryItem,
  useGetProperties, getGetPropertiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Sparkles, Plus, X, Check,
  ShoppingCart, Trash2, Sun, Coffee, Moon, Loader2
} from "lucide-react";
import { startOfWeek, addWeeks, subWeeks, format, addDays } from "date-fns";

// ── constants ────────────────────────────────────────────────────────────────

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type MealType = "breakfast" | "lunch" | "dinner";

const MEAL_TYPES: { type: MealType; label: string; Icon: React.ComponentType<any>; color: string; bg: string }[] = [
  { type: "breakfast", label: "Breakfast", Icon: Coffee,  color: "text-amber-600",  bg: "bg-amber-50 border-amber-200" },
  { type: "lunch",     label: "Lunch",     Icon: Sun,     color: "text-sage-600",   bg: "bg-green-50 border-green-200" },
  { type: "dinner",    label: "Dinner",    Icon: Moon,    color: "text-primary",    bg: "bg-primary/5 border-primary/20" },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function mondayOfWeek(d: Date): Date {
  const dow = d.getDay(); // 0=Sun
  const diff = (dow === 0 ? -6 : 1 - dow);
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

/** dayOfWeek 0–6 mapped to Mon–Sun (API stores 0=Sun so we map) */
function dayIndexToApi(i: number): number {
  // i=0 Mon … i=6 Sun. API dayOfWeek: 0=Sun, 1=Mon … 6=Sat
  return i === 6 ? 0 : i + 1;
}
function apiDayToIndex(d: number): number {
  return d === 0 ? 6 : d - 1;
}

// ── inline meal slot ──────────────────────────────────────────────────────────

function MealSlot({
  meal,
  mealType,
  dayLabel,
  onAdd,
  onDelete,
}: {
  meal?: any;
  mealType: { type: MealType; label: string; Icon: React.ComponentType<any>; color: string; bg: string };
  dayLabel: string;
  onAdd: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (meal) return; // already has a meal — click X to remove
    setEditing(true);
    setValue("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commit = () => {
    if (value.trim()) onAdd(value.trim());
    setEditing(false);
    setValue("");
  };

  const { Icon, color, bg } = mealType;

  if (meal) {
    return (
      <div className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl border ${bg} min-h-[2.75rem]`}>
        <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
        <span className="text-sm font-medium text-foreground flex-1 leading-snug">{meal.meal}</span>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-destructive transition-all rounded-md shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-h-[2.75rem]">
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setEditing(false); setValue(""); }
          }}
          onBlur={commit}
          placeholder={`${mealType.label}…`}
          className="flex-1 text-sm bg-background border-2 border-primary/40 rounded-xl px-3 py-2 focus:outline-none focus:border-primary min-w-0"
        />
        <button onClick={commit} className="w-8 h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-lg shrink-0">
          <Check className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 transition-all text-muted-foreground min-h-[2.75rem] group`}
      title={`Add ${mealType.label} for ${dayLabel}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 opacity-50" />
      <span className="text-xs font-medium opacity-60 group-hover:opacity-100">{mealType.label}</span>
      <Plus className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-60" />
    </button>
  );
}

// ── grocery list section ───────────────────────────────────────────────────────

const GROCERY_CATEGORIES = [
  { key: "produce",    label: "🥦 Produce" },
  { key: "protein",    label: "🥩 Protein" },
  { key: "dairy",      label: "🧀 Dairy" },
  { key: "bakery",     label: "🍞 Bakery" },
  { key: "pantry",     label: "🥫 Pantry" },
  { key: "frozen",     label: "🧊 Frozen" },
  { key: "beverages",  label: "🧃 Beverages" },
  { key: "other",      label: "📦 Other" },
];

function GrocerySection({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();

  const { data: lists } = useGetGroceryLists({ query: { queryKey: getGetGroceryListsQueryKey() } });
  const createList = useCreateGroceryList();
  const deleteList = useDeleteGroceryList();

  const mainList = lists?.[0];

  // Auto-create a "Weekly Shopping" list if none exist
  React.useEffect(() => {
    if (lists && lists.length === 0 && propertyId && !createList.isPending) {
      createList.mutate(
        { data: { name: "Weekly Shopping", propertyId } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() }) }
      );
    }
  }, [lists, propertyId]);

  if (!mainList) return (
    <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
      <Loader2 className="w-5 h-5 animate-spin" /> Setting up shopping list…
    </div>
  );

  return <GroceryListDetail list={mainList} />;
}

function GroceryListDetail({ list }: { list: any }) {
  const queryClient = useQueryClient();
  const { data: items } = useGetGroceryItems(list.id, { query: { queryKey: getGetGroceryItemsQueryKey(list.id) } });
  const addItem = useAddGroceryItem();
  const updateItem = useUpdateGroceryItem();
  const deleteItem = useDeleteGroceryItem();

  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newQty, setNewQty] = useState("");
  const [addingOpen, setAddingOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    updateItem.mutate(
      { id: item.id, data: { checked: !item.checked } },
      { onSuccess: invalidate }
    );
  };

  const handleDelete = (id: string) => {
    deleteItem.mutate({ id }, { onSuccess: invalidate });
  };

  const unchecked = items?.filter(i => !i.checked) ?? [];
  const checked = items?.filter(i => i.checked) ?? [];

  // Group unchecked by category
  const byCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: unchecked.filter(i => (i.category || "other") === cat.key),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-4">
      {/* Add item */}
      {addingOpen ? (
        <form onSubmit={handleAdd} className="bg-card border-2 border-primary/20 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              autoFocus
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              placeholder="Item name…"
              className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <input
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              placeholder="Qty"
              className="w-20 bg-background border-2 border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {GROCERY_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setNewCategory(cat.key)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${newCategory === cat.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
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

      {/* Grouped unchecked items */}
      {unchecked.length === 0 && checked.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8 italic">List is empty — add items above or plan your meals and add from there.</p>
      )}

      {byCategory.map(group => (
        <div key={group.key}>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">{group.label}</p>
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

      {/* Checked/done items */}
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
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Meals() {
  const queryClient = useQueryClient();

  // Week state (Mon-anchored)
  const [weekOffset, setWeekOffset] = useState(0);
  const baseMonday = mondayOfWeek(new Date());
  const monday = addWeeks(baseMonday, weekOffset);
  const weekStart = monday.toISOString();

  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  const houseProperty = properties?.find(p => p.type === "house") ?? properties?.[0];

  const { data: meals, isLoading } = useGetMealPlans(
    { weekStart },
    { query: { queryKey: getGetMealPlansQueryKey({ weekStart }) } }
  );
  const createMeal = useCreateMealPlanEntry();
  const deleteMeal = useDeleteMealPlanEntry();

  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"meals" | "shopping">("meals");

  const invalidateMeals = () => queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) });

  const getMeal = (dayIndex: number, type: MealType) => {
    const apiDay = dayIndexToApi(dayIndex);
    return meals?.find(m => m.dayOfWeek === apiDay && m.mealType === type);
  };

  const handleAdd = (dayIndex: number, type: MealType, text: string) => {
    if (!houseProperty) return;
    createMeal.mutate(
      {
        data: {
          weekStart,
          dayOfWeek: dayIndexToApi(dayIndex),
          mealType: type,
          meal: text,
          propertyId: houseProperty.id,
        },
      },
      { onSuccess: invalidateMeals }
    );
  };

  const handleDelete = (id: string) => {
    deleteMeal.mutate({ id }, { onSuccess: invalidateMeals });
  };

  const handleAISuggestWeek = async () => {
    setAiLoading(true);
    try {
      const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${baseUrl}/api/ai/suggest-week`, { method: "POST" });
      if (!res.ok) throw new Error("AI request failed");
      const data = await res.json();

      if (!Array.isArray(data?.days)) return;

      const dayNameToIndex: Record<string, number> = {
        monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
        friday: 4, saturday: 5, sunday: 6,
      };

      for (const day of data.days) {
        const idx = dayNameToIndex[day.dayName?.toLowerCase()] ?? -1;
        if (idx === -1) continue;

        for (const [mType, value] of [
          ["breakfast", day.breakfast],
          ["lunch", day.lunch],
          ["dinner", day.dinner],
        ] as [MealType, string][]) {
          if (!value) continue;
          if (getMeal(idx, mType)) continue; // don't overwrite existing entries
          handleAdd(idx, mType, value);
        }
      }

      setTimeout(invalidateMeals, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  const isCurrentWeek = weekOffset === 0;
  const isPastWeek = weekOffset < 0;

  return (
    <div className="animate-in fade-in duration-300">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight">Meals</h1>
          <p className="text-muted-foreground mt-1 font-medium">
            {isCurrentWeek ? "This week" : isPastWeek ? "Past week" : "Next week"} · {format(monday, "MMM d")}–{format(addDays(monday, 6), "MMM d, yyyy")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Week navigation */}
          <div className="flex items-center bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="px-3 py-2.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className={`px-4 py-2.5 text-sm font-bold transition-colors ${isCurrentWeek ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              Today
            </button>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="px-3 py-2.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* AI Plan */}
          <button
            onClick={handleAISuggestWeek}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 disabled:opacity-60"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiLoading ? "Planning…" : "Plan Week"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-6 w-fit">
        {[
          { key: "meals", label: "Meal Plan" },
          { key: "shopping", label: "Shopping List" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "meals" ? (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {DAYS.map(d => (
              <div key={d} className="space-y-2">
                <div className="h-6 bg-muted rounded-lg animate-pulse w-16" />
                <div className="h-12 bg-muted rounded-xl animate-pulse" />
                <div className="h-12 bg-muted rounded-xl animate-pulse" />
                <div className="h-12 bg-muted rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          /* ── Week grid ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {DAYS.map((day, idx) => {
              const date = addDays(monday, idx);
              const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

              return (
                <div
                  key={day}
                  className={`space-y-2 bg-card rounded-2xl p-3 border-2 transition-all ${isToday ? "border-primary/30 shadow-md" : "border-border/50"}`}
                >
                  {/* Day header */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-bold text-sm ${isToday ? "text-primary" : "text-foreground"}`}>
                      {DAY_SHORT[idx]}
                    </span>
                    <span className={`text-xs font-medium ${isToday ? "text-primary bg-primary/10 px-1.5 py-0.5 rounded-md" : "text-muted-foreground"}`}>
                      {format(date, "MMM d")}
                    </span>
                  </div>

                  {/* Meal slots */}
                  {MEAL_TYPES.map(mt => (
                    <MealSlot
                      key={mt.type}
                      meal={getMeal(idx, mt.type)}
                      mealType={mt}
                      dayLabel={day}
                      onAdd={text => handleAdd(idx, mt.type, text)}
                      onDelete={() => {
                        const m = getMeal(idx, mt.type);
                        if (m) handleDelete(m.id);
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ── Shopping list ── */
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-xl">Shopping List</h2>
              <p className="text-sm text-muted-foreground">Check off as you shop</p>
            </div>
          </div>

          {houseProperty ? (
            <GrocerySection propertyId={houseProperty.id} />
          ) : (
            <div className="text-muted-foreground py-8 text-center animate-pulse">Loading…</div>
          )}
        </div>
      )}
    </div>
  );
}
