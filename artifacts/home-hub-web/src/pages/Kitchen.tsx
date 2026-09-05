import React, { useState, useRef } from "react";
import {
  useGetMealPlans, getGetMealPlansQueryKey,
  useCreateMealPlanEntry, useDeleteMealPlanEntry, useUpdateMealPlanEntry,
  useGetGroceryLists, getGetGroceryListsQueryKey,
  useCreateGroceryList, useDeleteGroceryList,
  useGetGroceryItems, getGetGroceryItemsQueryKey,
  useUpdateGroceryItem, useAddGroceryItem, useDeleteGroceryItem,
  useGetProperties, getGetPropertiesQueryKey,
  useGetRecipes, getGetRecipesQueryKey,
  useCreateRecipe, useUpdateRecipe, useDeleteRecipe,
  useGetFamilyMembers, getGetFamilyMembersQueryKey,
  useGetMealRatings, getGetMealRatingsQueryKey,
  useUpsertMealRating, useDeleteMealRating,
  type FamilyMember, type MealRating,
  useGetStores, getGetStoresQueryKey,
  useUpdateGroceryListStore,
  type HouseholdStore,
  type GroceryCategoryKey
} from "@workspace/api-client-react";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { Link as RouterLink } from "wouter";
import { usePreferences } from "@/context/PreferencesContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Sparkles, Plus, X, Check,
  ShoppingCart, Trash2, Sun, Coffee, Moon, Loader2, Store, ChevronDown,
  Link, MessageSquare, ThumbsUp, ThumbsDown, Minus, Bookmark, BookOpen,
  ExternalLink, Star, AlertTriangle,
} from "lucide-react";
import { addWeeks, format, addDays } from "date-fns";

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

// ── rating config ─────────────────────────────────────────────────────────────

const RATING_CYCLE = ["love", "ok", "skip"] as const;
type RatingKey = typeof RATING_CYCLE[number];

const RATING_META: Record<RatingKey, { emoji: string; label: string; bg: string }> = {
  love: { emoji: "❤️", label: "Love it",        bg: "bg-red-100 border-red-300" },
  ok:   { emoji: "👍", label: "It's okay",      bg: "bg-amber-100 border-amber-300" },
  skip: { emoji: "🙅", label: "Skip next time", bg: "bg-muted border-border" },
};

/** Cycle rating: undefined → love → ok → skip → undefined */
function cycleRating(current: RatingKey | undefined): RatingKey | undefined {
  if (!current) return "love";
  const idx = RATING_CYCLE.indexOf(current);
  if (idx === RATING_CYCLE.length - 1) return undefined;
  return RATING_CYCLE[idx + 1];
}

// ── URL import modal ──────────────────────────────────────────────────────────

function UrlImportForm({
  onImport,
  onCancel,
}: {
  onImport: (name: string, url: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ai/extract-recipe-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onImport(data.name, url.trim());
    } catch (err: any) {
      setError(err.message ?? "Couldn't read that page. Try a direct recipe URL.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handle} className="space-y-2 p-2 bg-card border-2 border-primary/20 rounded-xl shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
        <Link className="w-3 h-3" /> Import from recipe URL
      </div>
      <div className="flex gap-1">
        <input
          ref={inputRef}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
          className="flex-1 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary min-w-0"
        />
        <button type="submit" disabled={loading} className="px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold disabled:opacity-50 shrink-0">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-lg">
          <X className="w-3 h-3" />
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

function SaveToCookbookPrompt({
  mealName,
  sourceUrl,
  onSave,
  onDismiss,
}: {
  mealName: string;
  sourceUrl?: string;
  onSave: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 pb-2">
      <Bookmark className="w-3 h-3 text-primary shrink-0" />
      <span className="text-xs text-muted-foreground flex-1">Save to cookbook?</span>
      <button
        onClick={onSave}
        className="text-xs font-bold text-primary hover:underline"
      >
        Save
      </button>
      <button onClick={onDismiss} className="text-muted-foreground/50 hover:text-muted-foreground">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
function MemberRatingRow({
  mealId,
  members,
  activeMemberId,
}: {
  mealId: string;
  members: FamilyMember[];
  activeMemberId: string | null;
}) {
  const queryClient = useQueryClient();
  const mealRatingsKey = getGetMealRatingsQueryKey({ mealPlanId: mealId });
  const { data: ratings } = useGetMealRatings(
    { mealPlanId: mealId },
    { query: { queryKey: mealRatingsKey } }
  );
  const upsert = useUpsertMealRating();
  const deleteMr = useDeleteMealRating();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: mealRatingsKey });

  const ratingByMember = new Map<string, MealRating>(
    (ratings ?? []).map(r => [r.memberId, r])
  );

  const handleMemberRate = (member: FamilyMember, current: RatingKey | undefined) => {
    const next = cycleRating(current);
    if (next) {
      upsert.mutate(
        { data: { mealPlanId: mealId, memberId: member.id, rating: next } },
        { onSuccess: invalidate }
      );
    } else {
      const existing = ratingByMember.get(member.id);
      if (existing) {
        deleteMr.mutate({ id: existing.id }, { onSuccess: invalidate });
      }
    }
  };

  // Warn if more skips than loves (and at least one skip)
  const loves = (ratings ?? []).filter(r => r.rating === "love").length;
  const skips = (ratings ?? []).filter(r => r.rating === "skip").length;
  const showWarning = skips > 0 && skips > loves;

  // Limit members shown to keep the UI tight — show up to 5
  const shownMembers = members.slice(0, 5);

  return (
    <div>
      {showWarning && (
        <div className="flex items-center gap-1 px-2 pb-1">
          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
          <span className="text-[10px] text-amber-600 font-medium">Some family members prefer to skip this one</span>
        </div>
      )}
      <div className="flex items-center gap-1 px-2 pb-2 flex-wrap">
        {shownMembers.map(member => {
          const mr = ratingByMember.get(member.id);
          const rating = mr?.rating as RatingKey | undefined;
          const meta = rating ? RATING_META[rating] : null;
          const isActive = member.id === activeMemberId;
          return (
            <button
              key={member.id}
              onClick={() => handleMemberRate(member, rating)}
              title={`${member.name}: ${rating ? RATING_META[rating].label : "No rating — tap to rate"}`}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                meta
                  ? `${meta.bg} text-foreground`
                  : isActive
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-border/50 text-muted-foreground/60 hover:border-border"
              }`}
            >
              <span
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                style={{ backgroundColor: member.color || "#2D6A4F" }}
              >
                {member.name.charAt(0)}
              </span>
              {meta ? <span>{meta.emoji}</span> : <span className="opacity-50">+</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MealSlot({
  meal,
  mealType,
  dayLabel,
  onAdd,
  onDelete,
  onNote,
  onSaveToCookbook,
  cookbookNames,
  pendingFill,
  members,
  activeMemberId,
}: {
  meal?: any;
  mealType: { type: MealType; label: string; Icon: React.ComponentType<any>; color: string; bg: string };
  dayLabel: string;
  onAdd: (text: string, sourceUrl?: string) => void;
  onDelete: () => void;
  onNote: (id: string, notes: string) => void;
  onSaveToCookbook: (name: string, sourceUrl?: string) => void;
  cookbookNames: Set<string>;
  /** When set and the slot is empty, clicking directly adds this recipe name without opening the editor */
  pendingFill?: string;
  members: FamilyMember[];
  activeMemberId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | undefined>();
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (meal) return;
    // If a recipe is pending, fill directly without opening the editor
    if (pendingFill) {
      onAdd(pendingFill);
      return;
    }
    setEditing(true);
    setValue("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commit = () => {
    if (value.trim()) onAdd(value.trim());
    setEditing(false);
    setValue("");
  };

  const commitNote = () => {
    if (meal) onNote(meal.id, noteValue);
    setShowNotes(false);
  };

  React.useEffect(() => {
    if (meal?.notes !== undefined) setNoteValue(meal.notes ?? "");
  }, [meal?.notes]);

  const { Icon, color, bg } = mealType;

  // Whether this meal is already in the cookbook (case-insensitive)
  const inCookbook = meal ? cookbookNames.has(meal.meal.toLowerCase().trim()) : false;

  if (meal) {
    return (
      <div className={`rounded-xl border ${bg} overflow-hidden`}>
        {/* Meal name row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
          <span className="text-sm font-medium text-foreground flex-1 leading-snug">{meal.meal}</span>
          {/* Bookmark button */}
          <button
            onClick={() => {
              if (inCookbook) return;
              setShowSavePrompt(v => !v);
            }}
            title={inCookbook ? "Already in cookbook" : "Save to cookbook"}
            className={`w-5 h-5 flex items-center justify-center rounded-md transition-all shrink-0 ${
              inCookbook
                ? "text-primary opacity-70 cursor-default"
                : "text-muted-foreground/40 hover:text-primary"
            }`}
          >
            <Bookmark className={`w-3 h-3 ${inCookbook ? "fill-current" : ""}`} />
          </button>
          <button onClick={onDelete} className="w-5 h-5 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-all rounded-md shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Per-member ratings */}
        {members.length > 0 && (
          <MemberRatingRow mealId={meal.id} members={members} activeMemberId={activeMemberId} />
        )}

        {/* Notes toggle */}
        <div className="flex items-center gap-1 px-2 pb-2">
          <button
            onClick={() => { setShowNotes(v => !v); setNoteValue(meal.notes ?? ""); }}
            title="Add note"
            className={`w-6 h-6 flex items-center justify-center rounded-lg border transition-all ${(meal.notes || showNotes) ? "border-primary/30 text-primary bg-primary/5" : "border-transparent text-muted-foreground/40 hover:text-muted-foreground"}`}
          >
            <MessageSquare className="w-3 h-3" />
          </button>
        </div>

        {/* Note badge */}
        {meal.notes && !showNotes && (
          <p className="text-xs text-muted-foreground italic px-3 pb-2 leading-snug">{meal.notes}</p>
        )}

        {/* Notes editor */}
        {showNotes && (
          <div className="px-2 pb-2 flex gap-1">
            <input
              autoFocus
              value={noteValue}
              onChange={e => setNoteValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitNote(); if (e.key === "Escape") setShowNotes(false); }}
              placeholder="Add a note…"
              className="flex-1 text-xs bg-background border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-primary"
            />
            <button onClick={commitNote} className="w-6 h-6 flex items-center justify-center bg-primary text-primary-foreground rounded-lg shrink-0">
              <Check className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Save-to-cookbook prompt */}
        {showSavePrompt && !inCookbook && (
          <SaveToCookbookPrompt
            mealName={meal.meal}
            onSave={() => {
              onSaveToCookbook(meal.meal, pendingUrl);
              setShowSavePrompt(false);
            }}
            onDismiss={() => setShowSavePrompt(false)}
          />
        )}
      </div>
    );
  }

  if (importingUrl) {
    return (
      <UrlImportForm
        onImport={(name, url) => {
          onAdd(name, url);
          setImportingUrl(false);
          // After adding from URL, auto-prompt to save to cookbook
          setPendingUrl(url);
          setShowSavePrompt(true);
        }}
        onCancel={() => setImportingUrl(false)}
      />
    );
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 min-h-[2.75rem]">
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setEditing(false); setValue(""); }
            }}
            onBlur={e => { if (!e.relatedTarget) commit(); }}
            placeholder={`${mealType.label}…`}
            className="flex-1 text-sm bg-background border-2 border-primary/40 rounded-xl px-3 py-2 focus:outline-none focus:border-primary min-w-0"
          />
          <button onClick={commit} className="w-8 h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-lg shrink-0">
            <Check className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setEditing(false)} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <button type="button" onClick={() => { setEditing(false); setImportingUrl(true); }} className="text-xs text-primary/60 hover:text-primary flex items-center gap-1 px-1 transition-colors">
          <Link className="w-3 h-3" /> From URL instead
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 transition-all text-muted-foreground min-h-[2.75rem] group"
      title={`Add ${mealType.label} for ${dayLabel}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 opacity-50" />
      <span className="text-xs font-medium opacity-100 sm:opacity-60 sm:group-hover:opacity-100">{mealType.label}</span>
      <Plus className="ml-auto h-3 w-3 opacity-60 sm:opacity-0 sm:group-hover:opacity-60" />
    </button>
  );
}

const RATING_BADGE: Record<string, { label: string; emoji: string; cls: string }> = {
  love: { label: "Love it",        emoji: "❤️", cls: "bg-red-50 text-red-600 border-red-200" },
  ok:   { label: "It's okay",      emoji: "👍", cls: "bg-amber-50 text-amber-600 border-amber-200" },
  skip: { label: "Skip next time", emoji: "🙅", cls: "bg-muted text-muted-foreground border-border" },
};
const ALL_CATEGORIES: Record<string, { label: string; emoji: string }> = {
  produce:   { label: "Produce",            emoji: "🥦" },
  deli:      { label: "Deli & Lunch Meat",  emoji: "🥪" },
  meat:      { label: "Meat & Seafood",     emoji: "🥩" },
  dairy:     { label: "Dairy & Eggs",       emoji: "🧀" },
  bread:     { label: "Bread & Bakery",     emoji: "🍞" },
  grains:    { label: "Grains & Pasta",     emoji: "🌾" },
  canned:    { label: "Canned & Pantry",    emoji: "🥫" },
  snacks:    { label: "Snacks",             emoji: "🍿" },
  frozen:    { label: "Frozen",             emoji: "🧊" },
  beverages: { label: "Beverages",          emoji: "🧃" },
  household: { label: "Household",          emoji: "🧺" },
  other:     { label: "Other",              emoji: "📦" },
};

const GROCERY_CATEGORIES = Object.entries(ALL_CATEGORIES).map(([key, { label, emoji }]) => ({
  key,
  label: `${emoji} ${label}`,
}));
const LEGACY_MAP: Record<string, string> = {
  protein: "meat",
  bakery:  "bread",
  pantry:  "canned",
};

function resolveCategory(raw: string | null | undefined): string {
  const k = raw ?? "other";
  return LEGACY_MAP[k] ?? (ALL_CATEGORIES[k] ? k : "other");
}

type MealForShopping = { dayName: string; mealType: string; meal: string };
function GrocerySection({ propertyId, meals }: { propertyId: string; meals: MealForShopping[] }) {
  const queryClient = useQueryClient();

  const { data: lists } = useGetGroceryLists({ query: { queryKey: getGetGroceryListsQueryKey() } });
  const createList = useCreateGroceryList();

  const propertyLists = lists?.filter(list => String(list.propertyId) === String(propertyId)) ?? [];
  const mainList = propertyLists[0];

  // Auto-create a "Weekly Shopping" list if none exist
  React.useEffect(() => {
    if (lists && propertyLists.length === 0 && propertyId && !createList.isPending) {
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

  return <GroceryListDetail list={mainList} meals={meals} />;
}

function GroceryListDetail({ list, meals }: { list: any; meals: MealForShopping[] }) {
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
                <button onClick={() => handleDelete(item.id)} aria-label={`Delete ${item.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-all hover:text-destructive sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100">
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
                <button onClick={() => handleDelete(item.id)} aria-label={`Delete ${item.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-all hover:text-destructive sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100">
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
  const { preferences } = usePreferences();

  // Week state (Mon-anchored)
  const [weekOffset, setWeekOffset] = useState(0);
  const baseMonday = mondayOfWeek(new Date());
  const monday = addWeeks(baseMonday, weekOffset);
  const weekStart = monday.toISOString();

  const { activeMember } = useActiveMember();

  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const members = familyMembers ?? [];

  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  const houseProperty = properties?.find(p => p.type === "house") ?? properties?.[0];

  const { data: meals, isLoading } = useGetMealPlans(
    { weekStart },
    { query: { queryKey: getGetMealPlansQueryKey({ weekStart }) } }
  );
  const createMeal = useCreateMealPlanEntry();
  const deleteMeal = useDeleteMealPlanEntry();
  const updateMeal = useUpdateMealPlanEntry();

  // Tab + UI state — declared before the recipe query so `activeTab` is in scope
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"meals" | "shopping" | "recipes">(() => preferences.tabs.meals.defaultView);
  const [pendingRecipeName, setPendingRecipeName] = useState<string | null>(null);

  // Recipes (cookbook) — scoped to house property.
  // Only fetched when the Cookbook tab is active so that the Clerk session
  // is fully established before the first authenticated request fires.
  const propertyIdStr = houseProperty ? String(houseProperty.id) : "";
  const recipesParams = houseProperty ? { propertyId: propertyIdStr } : null;
  const { data: recipes } = useGetRecipes(
    recipesParams ?? { propertyId: "" },
    {
      query: {
        queryKey: getGetRecipesQueryKey(recipesParams ?? undefined),
        enabled: !!houseProperty && activeTab === "recipes",
        staleTime: 30_000,
      },
    }
  );
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();

  const cookbookNames = new Set((recipes ?? []).map(r => r.name.toLowerCase().trim()));

  const invalidateMeals = () => queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) });
  const invalidateRecipes = () => queryClient.invalidateQueries({ queryKey: getGetRecipesQueryKey(recipesParams ?? undefined) });

  const getMeal = (dayIndex: number, type: MealType) => {
    const apiDay = dayIndexToApi(dayIndex);
    return meals?.find(m => m.dayOfWeek === apiDay && m.mealType === type);
  };

  const handleAdd = (dayIndex: number, type: MealType, text: string, sourceUrl?: string) => {
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

  const handleNote = (id: string, notes: string) => {
    updateMeal.mutate({ id, data: { notes } }, { onSuccess: invalidateMeals });
  };

  const handleSaveToCookbook = (name: string, sourceUrl?: string) => {
    if (!houseProperty) return;
    if (cookbookNames.has(name.toLowerCase().trim())) return;
    createRecipe.mutate(
      { data: { name, propertyId: String(houseProperty.id), sourceUrl: sourceUrl ?? null, notes: null } },
      { onSuccess: invalidateRecipes }
    );
  };

  const handleAISuggestWeek = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/ai/suggest-week`, { method: "POST" });
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

  // When user taps "use in meal plan" from cookbook — switch to meal tab with a pending recipe
  const handleUseRecipe = (name: string) => {
    setPendingRecipeName(name);
    setActiveTab("meals");
  };

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
          { key: "meals",    label: "Meal Plan" },
          { key: "shopping", label: "Shopping List" },
          { key: "recipes",  label: "Cookbook" },
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

      {/* Pending recipe banner */}
      {pendingRecipeName && activeTab === "meals" && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-2xl">
          <Bookmark className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-medium flex-1">
            Tap an empty meal slot to add <span className="text-primary">{pendingRecipeName}</span>
          </p>
          <button onClick={() => setPendingRecipeName(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
                  {MEAL_TYPES.map(mt => {
                    const existing = getMeal(idx, mt.type);
                    return (
                      <MealSlot
                        key={mt.type}
                        meal={existing}
                        mealType={mt}
                        dayLabel={day}
                        pendingFill={!existing && pendingRecipeName ? pendingRecipeName : undefined}
                        onAdd={(text, sourceUrl) => {
                          handleAdd(idx, mt.type, text, sourceUrl);
                          // Clear pending recipe after any successful add
                          if (pendingRecipeName) setPendingRecipeName(null);
                        }}
                        onDelete={() => {
                          if (existing) handleDelete(existing.id);
                        }}
                        onNote={handleNote}
                        onSaveToCookbook={handleSaveToCookbook}
                        cookbookNames={cookbookNames}
                        members={members}
                        activeMemberId={activeMember ? activeMember.id : null}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        )
      ) : activeTab === "shopping" ? (
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
            <GrocerySection
              propertyId={houseProperty.id}
              meals={(meals ?? []).map(m => ({
                dayName: DAYS[apiDayToIndex(m.dayOfWeek)] ?? "Day",
                mealType: m.mealType,
                meal: m.meal,
              }))}
            />
          ) : (
            <div className="text-muted-foreground py-8 text-center animate-pulse">Loading…</div>
          )}
        </div>
      ) : (
        /* ── Cookbook / Recipes ── */
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-xl">Cookbook</h2>
              <p className="text-sm text-muted-foreground">Your saved family favorites</p>
            </div>
          </div>
          <CookbookSection propertyId={propertyIdStr} onUseRecipe={handleUseRecipe} />
        </div>
      )}
    </div>
  );
}

function CookbookSection({ propertyId, onUseRecipe }: { propertyId: string; onUseRecipe?: (name: string) => void }) {
  const queryClient = useQueryClient();
  const params = { propertyId };
  const { data: recipes, isLoading } = useGetRecipes(params, { query: { queryKey: getGetRecipesQueryKey(params) } });
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetRecipesQueryKey(params) });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createRecipe.mutate(
      { data: { name: newName.trim(), propertyId, sourceUrl: newUrl.trim() || null, notes: newNotes.trim() || null } },
      {
        onSuccess: () => {
          setNewName(""); setNewUrl(""); setNewNotes("");
          setAdding(false);
          invalidate();
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteRecipe.mutate({ id }, { onSuccess: invalidate });
  };

  const handleSaveNotes = (id: string) => {
    updateRecipe.mutate({ id, data: { notes: editNotes || null } }, {
      onSuccess: () => { setEditingId(null); invalidate(); },
    });
  };

  React.useEffect(() => {
    if (adding) setTimeout(() => inputRef.current?.focus(), 50);
  }, [adding]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {recipes?.length === 0
            ? "Your cookbook is empty — save meals you love with the bookmark button."
            : `${recipes?.length} saved recipe${(recipes?.length ?? 0) !== 1 ? "s" : ""}`}
        </p>
        <button
          onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Recipe
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <form onSubmit={handleAdd} className="bg-card border-2 border-primary/20 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-sm font-bold text-foreground">New Recipe</p>
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Recipe name…"
            className="w-full bg-background border-2 border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <input
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="Source URL (optional)"
            type="url"
            className="w-full bg-background border-2 border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <textarea
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full bg-background border-2 border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="flex-1 py-2 rounded-xl border-2 border-border font-bold text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRecipe.isPending || !newName.trim()}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Save Recipe
            </button>
          </div>
        </form>
      )}

      {/* Recipe list */}
      {(recipes ?? []).length === 0 && !adding && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <BookOpen className="w-10 h-10 opacity-20" />
          <p className="text-sm font-medium">No saved recipes yet</p>
          <p className="text-xs text-center max-w-xs">
            Tap the <Bookmark className="inline w-3 h-3 mx-0.5" /> bookmark on any meal to save it here, or add one manually.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {(recipes ?? []).map(recipe => {
          const ratingBadge = recipe.aggregateRating ? RATING_BADGE[recipe.aggregateRating] : null;
          const isExpanded = expandedId === recipe.id;
          const isEditingNotes = editingId === recipe.id;

          return (
            <div
              key={recipe.id}
              className="bg-card border border-border/60 rounded-2xl overflow-hidden hover:border-border transition-colors"
            >
              {/* Top row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground leading-tight truncate">{recipe.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {recipe.timesCooked > 0 && (
                      <span className="text-xs text-muted-foreground">{recipe.timesCooked}× made</span>
                    )}
                    {ratingBadge && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${ratingBadge.cls}`}>
                        {ratingBadge.emoji} {ratingBadge.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Use in meal plan */}
                  {onUseRecipe && (
                    <button
                      onClick={e => { e.stopPropagation(); onUseRecipe(recipe.name); }}
                      title="Use in meal plan"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(recipe.id); }}
                    title="Remove from cookbook"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-border/50 px-4 py-3 space-y-3 bg-muted/20">
                  {/* Source URL */}
                  {recipe.sourceUrl && (() => {
                    // Defensively allow only http/https hrefs to block javascript: XSS
                    let safeHref: string | null = null;
                    try {
                      const u = new URL(recipe.sourceUrl);
                      if (u.protocol === "http:" || u.protocol === "https:") safeHref = u.toString();
                    } catch { /* invalid URL — don't render as link */ }
                    return safeHref ? (
                      <a
                        href={safeHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate">{safeHref}</span>
                      </a>
                    ) : null;
                  })()}

                  {/* Notes */}
                  {isEditingNotes ? (
                    <div className="flex gap-2">
                      <textarea
                        autoFocus
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        rows={2}
                        placeholder="Add notes…"
                        className="flex-1 text-xs bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:border-primary resize-none"
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleSaveNotes(recipe.id)}
                          className="w-7 h-7 flex items-center justify-center bg-primary text-primary-foreground rounded-lg"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="w-7 h-7 flex items-center justify-center border border-border rounded-lg text-muted-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingId(recipe.id); setEditNotes(recipe.notes ?? ""); }}
                      className="text-left w-full"
                    >
                      {recipe.notes ? (
                        <p className="text-xs text-muted-foreground italic leading-snug">{recipe.notes}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground/50 italic flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> Add notes…
                        </p>
                      )}
                    </button>
                  )}

                  {/* Add to meal plan shortcut */}
                  {onUseRecipe && (
                    <button
                      onClick={() => onUseRecipe(recipe.name)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-primary/20 text-primary text-xs font-bold hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add to this week's meal plan
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
