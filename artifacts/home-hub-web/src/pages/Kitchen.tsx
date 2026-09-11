import React, { useState, useRef } from "react";
import {
  useGetMealPlans, getGetMealPlansQueryKey,
  useCreateMealPlanEntry, useDeleteMealPlanEntry, useUpdateMealPlanEntry,
  useUpsertMealPlanEntries,
  useGetGroceryLists, getGetGroceryListsQueryKey,
  useCreateGroceryList, useDeleteGroceryList,
  useGetGroceryItems, getGetGroceryItemsQueryKey,
  useSearchGroceryCatalog, getSearchGroceryCatalogQueryKey,
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
import { useGetInventory, KitchenInventoryItem } from "@/hooks/useKitchenInventory";
import { InventorySection } from "@/components/meals/InventorySection";
import { getMatchedInventoryNames } from "@/lib/inventory-utils";
import { Link as RouterLink } from "wouter";
import { usePreferences } from "@/context/PreferencesContext";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  ChevronLeft, ChevronRight, Sparkles, Plus, X, Check,
  ShoppingCart, Trash2, Sun, Coffee, Moon, Loader2, Store, ChevronDown,
  Link, MessageSquare, ThumbsUp, ThumbsDown, Minus, Bookmark, BookOpen,
  ExternalLink, Star, AlertTriangle, Headphones, CheckCircle2, Pencil,
} from "lucide-react";
import { addWeeks, format, addDays } from "date-fns";
import { PlanWeekDialog } from "@/components/meals/PlanWeekDialog";
import { GuidedCooking, IngredientShopping } from "@/components/meals/RecipeTools";
import { RecipeImport } from "@/components/meals/RecipeImport";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const RATING_META: Record<RatingKey, { Icon: React.ComponentType<any>; label: string; bg: string }> = {
  love: { Icon: ThumbsUp, label: "Love it",        bg: "bg-red-100 border-red-300" },
  ok:   { Icon: CheckCircle2, label: "It's okay",      bg: "bg-amber-100 border-amber-300" },
  skip: { Icon: ThumbsDown, label: "Skip next time", bg: "bg-muted border-border" },
};

/** Cycle rating: undefined → love → ok → skip → undefined */
function cycleRating(current: RatingKey | undefined): RatingKey | undefined {
  if (!current) return "love";
  const idx = RATING_CYCLE.indexOf(current);
  if (idx === RATING_CYCLE.length - 1) return undefined;
  return RATING_CYCLE[idx + 1];
}

// ── URL import modal ──────────────────────────────────────────────────────────

type ImportedUrlRecipe = {
  name: string;
  ingredients: Array<{ name: string; quantity?: string | null; category?: string | null }>;
  instructions: string[];
  servings?: number | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
};

function UrlImportForm({
  onImport,
  onCancel,
}: {
  onImport: (recipe: ImportedUrlRecipe, url: string) => Promise<void>;
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
      await onImport(data as ImportedUrlRecipe, url.trim());
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
  const [rateError, setRateError] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: mealRatingsKey });

  const ratingByMember = new Map<string, MealRating>(
    (ratings ?? []).map(r => [r.memberId, r])
  );

  const handleMemberRate = (member: FamilyMember, current: RatingKey | undefined) => {
    setRateError("");
    const next = cycleRating(current);
    if (next) {
      upsert.mutate(
        { data: { mealPlanId: mealId, memberId: member.id, rating: next } },
        { onSuccess: invalidate, onError: () => setRateError("Rating didn't save — try again.") },
      );
    } else {
      const existing = ratingByMember.get(member.id);
      if (existing) {
        deleteMr.mutate(
          { id: existing.id },
          { onSuccess: invalidate, onError: () => setRateError("Rating didn't clear — try again.") },
        );
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
      {rateError && (
        <p role="alert" className="text-[10px] text-destructive font-medium px-2 pb-1">{rateError}</p>
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
              className={`flex min-h-[32px] items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${
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
              {meta ? <meta.Icon className="w-3 h-3" /> : <span className="opacity-50">+</span>}
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
  onEdit,
  onDelete,
  onNote,
  onSaveToCookbook,
  onImportUrl,
  propertyId,
  cookbookNames,
  pendingFill,
  members,
  activeMemberId,
  suggestions,
  matchedInventory,
  onOpenRecipe,
}: {
  meal?: any;
  mealType: { type: MealType; label: string; Icon: React.ComponentType<any>; color: string; bg: string };
  dayLabel: string;
  onAdd: (text: string, sourceUrl?: string) => Promise<void>;
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onNote: (id: string, notes: string) => Promise<void>;
  onSaveToCookbook: (name: string, sourceUrl?: string) => void;
  onImportUrl: (recipe: ImportedUrlRecipe, sourceUrl: string) => Promise<void>;
  propertyId: string;
  cookbookNames: Set<string>;
  /** When set and the slot is empty, clicking directly adds this recipe name without opening the editor */
  pendingFill?: string;
  members: FamilyMember[];
  activeMemberId: string | null;
  suggestions?: string[];
  matchedInventory?: string[];
  onOpenRecipe?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [importingImage, setImportingImage] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | undefined>();
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [mealError, setMealError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = async () => {
    if (meal || isPending) return;
    setMealError("");
    // If a recipe is pending, fill directly without opening the editor
    if (pendingFill) {
      setIsPending(true);
      try {
        await onAdd(pendingFill);
      } catch (e) {
        setMealError(e instanceof Error ? e.message : "Failed to add meal");
      } finally {
        setIsPending(false);
      }
      return;
    }
    setEditing(true);
    setValue("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commit = async () => {
    if (!value.trim() || isPending) {
      if (!value.trim()) setEditing(false);
      return;
    }
    setMealError("");
    setIsPending(true);
    try {
      if (meal) await onEdit(meal.id, value.trim());
      else await onAdd(value.trim());
      setEditing(false);
      setValue("");
    } catch (err: any) {
      setMealError(err.message || "Failed to save");
    } finally {
      setIsPending(false);
    }
  };

  const commitNote = async () => {
    if (isPending) return;
    setMealError("");
    if (meal) {
      setIsPending(true);
      try {
        await onNote(meal.id, noteValue);
        setShowNotes(false);
      } catch (err: any) {
        setMealError(err.message || "Failed to save note");
      } finally {
        setIsPending(false);
      }
    } else {
      setShowNotes(false);
    }
  };

  React.useEffect(() => {
    if (meal?.notes !== undefined) setNoteValue(meal.notes ?? "");
  }, [meal?.notes]);

  const { Icon, color, bg } = mealType;
  const searchableMeals = [...new Map(
    (suggestions ?? []).map(suggestion => [suggestion.trim().toLowerCase(), suggestion.trim()])
  ).values()].filter(Boolean);
  const matchingMeals = searchableMeals
    .filter(suggestion => !value.trim() || suggestion.toLowerCase().includes(value.trim().toLowerCase()))
    .slice(0, 8);

  // Whether this meal is already in the cookbook (case-insensitive)
  const inCookbook = meal ? cookbookNames.has(meal.meal.toLowerCase().trim()) : false;

  if (meal && editing) {
    return (
      <div className={`space-y-1 rounded-xl border p-2 ${bg}`}>
        <div className="flex min-h-[2.75rem] items-center gap-1">
          <input
            ref={inputRef}
            value={value}
            disabled={isPending}
            onChange={event => setValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") void commit();
              if (event.key === "Escape") {
                setEditing(false);
                setValue("");
                setMealError("");
              }
            }}
            placeholder={`Search past ${mealType.label.toLowerCase()}s or enter a new meal…`}
            className="min-w-0 flex-1 rounded-xl border-2 border-primary/40 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <button type="button" disabled={isPending} onClick={() => void commit()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          </button>
          <button type="button" disabled={isPending} onClick={() => { setEditing(false); setValue(""); setMealError(""); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        {mealError && <p role="alert" className="px-1 text-xs font-medium text-destructive">{mealError}</p>}
        {matchingMeals.filter(suggestion => suggestion.toLowerCase() !== meal.meal.toLowerCase()).length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-sm">
            {matchingMeals
              .filter(suggestion => suggestion.toLowerCase() !== meal.meal.toLowerCase())
              .map(suggestion => (
                <button
                  key={suggestion.toLowerCase()}
                  type="button"
                  disabled={isPending}
                  onMouseDown={event => event.preventDefault()}
                  onClick={async () => {
                    if (isPending) return;
                    setIsPending(true);
                    setMealError("");
                    try {
                      await onEdit(meal.id, suggestion);
                      setEditing(false);
                      setValue("");
                    } catch (e) {
                      setMealError(e instanceof Error ? e.message : "Failed to save");
                    } finally {
                      setIsPending(false);
                    }
                  }}
                  className="w-full rounded-lg px-2 py-2 text-left text-xs font-semibold hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
          </div>
        )}
      </div>
    );
  }

  if (meal) {
    return (
      <div className={`rounded-xl border ${bg} overflow-hidden`}>
        {/* Meal name row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
          {inCookbook && onOpenRecipe ? (
            <button
              onClick={() => onOpenRecipe(meal.meal)}
              className="text-sm font-semibold text-primary flex-1 text-left leading-snug hover:underline truncate"
              title="Open recipe"
            >
              {meal.meal}
            </button>
          ) : (
            <span className="text-sm font-medium text-foreground flex-1 leading-snug">{meal.meal}</span>
          )}
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
          <button
            type="button"
            onClick={() => {
              setValue(meal.meal);
              setEditing(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            title="Edit meal"
            aria-label={`Edit ${meal.meal}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-primary"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button disabled={isPending} onClick={async () => {
            if (isPending) return;
            setIsPending(true);
            setMealError("");
            try {
              await onDelete();
            } catch (e) {
              setMealError(e instanceof Error ? e.message : "Failed to delete meal");
            } finally {
              setIsPending(false);
            }
          }} className="w-5 h-5 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-all rounded-md shrink-0 disabled:opacity-50">
            {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          </button>
        </div>

        {mealError && <p role="alert" className="px-3 pb-1 text-xs font-medium text-destructive">{mealError}</p>}

        {/* Per-member ratings */}
        {members.length > 0 && (
          <MemberRatingRow mealId={meal.id} members={members} activeMemberId={activeMemberId} />
        )}

        {/* Matched Inventory */}
        {matchedInventory && matchedInventory.length > 0 && (
          <div className="px-3 pb-1">
            <div className="flex flex-wrap gap-1">
              {matchedInventory.map(item => (
                <span key={item} className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                  Have {item}
                </span>
              ))}
            </div>
          </div>
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
          <div className="px-2 pb-2">
            <div className="flex gap-1">
              <input
                autoFocus
                value={noteValue}
                onChange={e => { setNoteValue(e.target.value); setMealError(""); }}
                onKeyDown={e => { if (e.key === "Enter") void commitNote(); if (e.key === "Escape") { setShowNotes(false); setMealError(""); } }}
                placeholder="Add a note…"
                className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 min-h-9 focus:outline-none focus:border-primary"
              />
              <button onClick={() => void commitNote()} className="w-9 min-h-9 flex items-center justify-center bg-primary text-primary-foreground rounded-lg shrink-0">
                <Check className="w-4 h-4" />
              </button>
            </div>
            {mealError && <p role="alert" className="mt-1 text-xs font-medium text-destructive">{mealError}</p>}
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
        onImport={async (recipe, url) => {
          await onImportUrl(recipe, url);
          setImportingUrl(false);
        }}
        onCancel={() => setImportingUrl(false)}
      />
    );
  }

  if (importingImage) {
    return (
      <div>
        <RecipeImport
          propertyId={propertyId}
          onSaved={async recipe => {
            await onAdd(recipe.name);
            setImportingImage(false);
          }}
        />
        <button
          type="button"
          onClick={() => setImportingImage(false)}
          className="min-h-11 w-full rounded-xl border border-border text-sm font-semibold"
        >
          Cancel screenshot import
        </button>
      </div>
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
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") { setEditing(false); setValue(""); setMealError(""); }
            }}
            onBlur={e => { if (!e.relatedTarget) void commit(); }}
            placeholder={`Search past ${mealType.label.toLowerCase()}s or add a new one…`}
            className="flex-1 text-sm bg-background border-2 border-primary/40 rounded-xl px-3 py-2 focus:outline-none focus:border-primary min-w-0"
          />
          <button onClick={() => void commit()} className="w-11 h-11 flex items-center justify-center bg-primary text-primary-foreground rounded-lg shrink-0">
            <Check className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => { setEditing(false); setMealError(""); }} className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        {mealError && <p role="alert" className="px-1 text-xs font-medium text-destructive">{mealError}</p>}
        {matchingMeals.length > 0 && (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-sm">
            <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Past meals & cookbook</p>
            {matchingMeals.map(suggestion => (
              <button
                key={suggestion.toLowerCase()}
                type="button"
                disabled={isPending}
                onMouseDown={event => event.preventDefault()}
                onClick={async () => {
                  if (isPending) return;
                  setIsPending(true);
                  setMealError("");
                  try {
                    await onAdd(suggestion);
                    setEditing(false);
                    setValue("");
                  } catch (e) {
                    setMealError(e instanceof Error ? e.message : "Failed to add meal");
                  } finally {
                    setIsPending(false);
                  }
                }}
                className="w-full rounded-lg px-2 py-2 text-left text-xs font-semibold text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 px-1">
          <button type="button" onClick={() => { setEditing(false); setImportingUrl(true); }} className="text-xs text-primary/70 hover:text-primary flex min-h-[44px] items-center gap-1 transition-colors">
            <Link className="w-3 h-3" /> From URL
          </button>
          <button type="button" onClick={() => { setEditing(false); setImportingImage(true); }} className="text-xs text-primary/70 hover:text-primary flex min-h-[44px] items-center gap-1 transition-colors">
            <BookOpen className="w-3 h-3" /> From screenshot
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <button
        onClick={startEdit}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/30 transition-all text-muted-foreground min-h-[2.75rem] group"
        title={`Add ${mealType.label} for ${dayLabel}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0 opacity-50" />
        <span className="text-xs font-medium opacity-100 sm:opacity-60 sm:group-hover:opacity-100">{mealType.label}</span>
        <Plus className="ml-auto h-3 w-3 opacity-60 sm:opacity-0 sm:group-hover:opacity-60" />
      </button>
    </div>
  );
}

const RATING_BADGE: Record<string, { label: string; Icon: React.ComponentType<any>; cls: string }> = {
  love: { label: "Love it",        Icon: ThumbsUp, cls: "bg-red-50 text-red-600 border-red-200" },
  ok:   { label: "It's okay",      Icon: CheckCircle2, cls: "bg-amber-50 text-amber-600 border-amber-200" },
  skip: { label: "Skip next time", Icon: ThumbsDown, cls: "bg-muted text-muted-foreground border-border" },
};
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

const GROCERY_CATEGORIES = Object.entries(ALL_CATEGORIES).map(([key, { label }]) => ({
  key,
  label,
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
type RecipeForShopping = {
  name: string;
  ingredients: Array<{ name: string; quantity?: string | null }>;
};
function GrocerySection({ propertyId, meals, recipes, inventory }: { propertyId: string; meals: MealForShopping[]; recipes: RecipeForShopping[]; inventory: KitchenInventoryItem[] }) {
  const queryClient = useQueryClient();

  const { data: lists } = useGetGroceryLists({ query: { queryKey: getGetGroceryListsQueryKey() } });
  const createList = useCreateGroceryList();
  const hasAttemptedCreate = useRef(false);

  const propertyLists = lists?.filter(list => String(list.propertyId) === String(propertyId)) ?? [];
  const mainList = propertyLists[0];

  // Auto-create a "Weekly Shopping" list if none exist
  React.useEffect(() => {
    if (lists && propertyLists.length === 0 && propertyId && !createList.isPending && !hasAttemptedCreate.current) {
      hasAttemptedCreate.current = true;
      createList.mutate(
        { data: { name: "Weekly Shopping", propertyId } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() }) }
      );
    }
  }, [lists, propertyId]);

  if (!mainList) {
    if (createList.isError) {
      return (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <p className="text-sm font-medium text-destructive">Failed to setup shopping list.</p>
          <button onClick={() => { hasAttemptedCreate.current = false; createList.reset(); }} className="px-3 py-1.5 text-xs font-bold bg-primary/10 text-primary rounded-lg">Retry</button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Setting up shopping list…
      </div>
    );
  }

  return <GroceryListDetail list={mainList} meals={meals} recipes={recipes} inventory={inventory} />;
}

function GroceryListDetail({ list, meals, recipes, inventory }: { list: any; meals: MealForShopping[]; recipes: RecipeForShopping[]; inventory: KitchenInventoryItem[] }) {
  const queryClient = useQueryClient();
  const { data: stores, isLoading: storesLoading } = useGetStores({ query: { queryKey: getGetStoresQueryKey() } });
  const updateStore = useUpdateGroceryListStore();

  const activeStoreId = list.storeId ?? stores?.find(s => s.isDefault)?.id ?? stores?.[0]?.id;
  const store = stores?.find(s => s.id === activeStoreId);

  const { data: items } = useGetGroceryItems(list.id, { query: { queryKey: getGetGroceryItemsQueryKey(list.id) } });
  const addItem = useAddGroceryItem();
  const updateItem = useUpdateGroceryItem();
  const deleteItem = useDeleteGroceryItem();
  const deleteList = useDeleteGroceryList();

  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("produce");
  const [newQty, setNewQty] = useState("");
  const [addingOpen, setAddingOpen] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState<GroceryCategoryKey | "">("");
  const [itemActionError, setItemActionError] = useState("");
  const [addItemMessage, setAddItemMessage] = useState("");
  const [addItemError, setAddItemError] = useState("");
  const [storePicker, setStorePicker] = useState(false);
  const [aiShoppingLoading, setAiShoppingLoading] = useState(false);
  const [aiShoppingError, setAiShoppingError] = useState<string | null>(null);
  const [generatedInventoryMatches, setGeneratedInventoryMatches] = useState<Array<{ name: string; quantity?: string | null }>>([]);
  const [deleteListOpen, setDeleteListOpen] = useState(false);
  const [deleteListError, setDeleteListError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredCatalogQuery = React.useDeferredValue(newItem.trim());
  const catalogParams = {
    query: deferredCatalogQuery || undefined,
    category: catalogCategory || undefined,
    limit: 60,
  };
  const { data: catalogItems, isFetching: catalogLoading } = useSearchGroceryCatalog(
    catalogParams,
    {
      query: {
        queryKey: getSearchGroceryCatalogQueryKey(catalogParams),
        enabled: addingOpen,
        staleTime: 5 * 60_000,
      },
    },
  );
  const mealPlanSignature = meals.map(meal => `${meal.dayName}:${meal.mealType}:${meal.meal}`).join("|");
  const inventorySignature = inventory.map(item => `${item.id}:${item.name}:${item.quantity ?? ""}`).join("|");
  React.useEffect(() => {
    setGeneratedInventoryMatches([]);
  }, [mealPlanSignature, inventorySignature]);

  const handleBuildFromMeals = async () => {
    if (meals.length === 0) return;
    setAiShoppingLoading(true);
    setAiShoppingError(null);
    try {
      const plannedMealNames = new Set(meals.map(meal => meal.meal.trim().toLowerCase()));
      const plannedRecipes = recipes.filter(recipe => plannedMealNames.has(recipe.name.trim().toLowerCase()));
      const res = await fetch(`/api/ai/shopping-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meals, recipes: plannedRecipes }),
      });
      const data = await res.json().catch(() => null) as {
        items?: Array<{ name: string; quantity: string | null; category: string }>;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || "The shopping list could not be generated.");
      if (!Array.isArray(data?.items)) return;

      const inventoryMatches = new Map<string, { name: string; quantity?: string | null }>();
      const seenNames = new Set(
        (items ?? []).filter(i => !i.checked).map(i => i.name.toLowerCase().trim())
      );

      const failedItems: string[] = [];
      for (const item of data.items) {
        const matchedNames = getMatchedInventoryNames([{ name: item.name }], inventory);
        if (matchedNames.length > 0) {
          for (const matchedName of matchedNames) {
            const inventoryItem = inventory.find(candidate => candidate.name.trim().toLowerCase() === matchedName.trim().toLowerCase());
            inventoryMatches.set(matchedName.trim().toLowerCase(), {
              name: matchedName,
              quantity: inventoryItem?.quantity,
            });
          }
          continue;
        }
        const key = item.name.toLowerCase().trim();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        const added = await new Promise<boolean>((resolve) => {
          addItem.mutate(
            { id: list.id, data: { name: item.name, quantity: item.quantity ?? null, category: item.category } },
            { onSuccess: () => resolve(true), onError: () => resolve(false) }
          );
        });
        if (!added) failedItems.push(item.name);
      }
      setGeneratedInventoryMatches([...inventoryMatches.values()]);

      queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(list.id) });
      queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });

      if (failedItems.length > 0) {
        setAiShoppingError(
          `Added the rest, but ${failedItems.length} item${failedItems.length === 1 ? "" : "s"} didn't save: ${failedItems.join(", ")}. You can add ${failedItems.length === 1 ? "it" : "them"} manually.`,
        );
      }
    } catch (err) {
      console.error("Build from meals error:", err);
      setAiShoppingError(err instanceof Error ? err.message : "Failed to build list — please try again.");
    } finally {
      setAiShoppingLoading(false);
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(list.id) });
    queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
  };

  const getMutationError = (error: unknown) => {
    const apiError = error as { data?: { error?: string }; message?: string };
    return apiError.data?.error || apiError.message || "That item could not be added. Please try again.";
  };

  const addNamedItem = async (name: string, category: GroceryCategoryKey | string) => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return;
    const existing = (items ?? []).find(item => item.name.trim().toLowerCase() === normalized);
    setAddItemError("");
    setAddItemMessage("");
    try {
      await addItem.mutateAsync({
        id: list.id,
        data: { name: name.trim(), quantity: newQty.trim() || null, category },
      });
      setNewItem("");
      setNewQty("");
      setAddItemMessage(
        existing?.checked
          ? `${name.trim()} moved back to your active list.`
          : existing
            ? `${name.trim()} is already on your list.`
            : `${name.trim()} added.`,
      );
      await invalidate();
    } catch (error) {
      setAddItemError(getMutationError(error));
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    void addNamedItem(newItem, newCategory);
  };

  const handleCheck = (item: any) => {
    setItemActionError("");
    updateItem.mutate(
      { id: item.id, data: { checked: !item.checked } },
      { onSuccess: invalidate, onError: () => setItemActionError(`Couldn't update ${item.name}. Please try again.`) },
    );
  };

  const handleDelete = (id: string) => {
    const item = (items ?? []).find(i => i.id === id);
    setItemActionError("");
    deleteItem.mutate(
      { id },
      { onSuccess: invalidate, onError: () => setItemActionError(`Couldn't remove ${item?.name ?? "that item"}. Please try again.`) },
    );
  };

  const handleSetStore = (storeId: string) => {
    setItemActionError("");
    updateStore.mutate(
      { id: list.id, data: { storeId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(list.id) });
        },
        onError: () => setItemActionError("Couldn't change the store. Please try again."),
      },
    );
    setStorePicker(false);
  };

  const handleDeleteList = async () => {
    setDeleteListError("");
    try {
      await deleteList.mutateAsync({ id: list.id });
      setDeleteListOpen(false);
      await queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
      queryClient.removeQueries({ queryKey: getGetGroceryItemsQueryKey(list.id) });
    } catch (error) {
      setDeleteListError(getMutationError(error));
    }
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
      return {
        key,
        label: dept.displayName,
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
      items: unmappedItems,
    });
  }

  const categoryOptions = storeDepartments.map(dept => {
    return {
      key: dept.categoryKey,
      label: dept.displayName,
    };
  });

  const plannedMealNames = new Set(meals.map(meal => meal.meal.trim().toLowerCase()));
  const availableForMeals = new Map<string, { name: string; quantity?: string | null; meals: Set<string> }>();
  for (const recipe of recipes) {
    if (!plannedMealNames.has(recipe.name.trim().toLowerCase())) continue;
    for (const matchedName of getMatchedInventoryNames(recipe.ingredients, inventory)) {
      const key = matchedName.trim().toLowerCase();
      const existing = availableForMeals.get(key);
      if (existing) {
        existing.meals.add(recipe.name);
      } else {
        const inventoryItem = inventory.find(item => item.name.trim().toLowerCase() === key);
        availableForMeals.set(key, {
          name: matchedName,
          quantity: inventoryItem?.quantity,
          meals: new Set([recipe.name]),
        });
      }
    }
  }
  for (const matchedItem of generatedInventoryMatches) {
    const key = matchedItem.name.trim().toLowerCase();
    if (!availableForMeals.has(key)) {
      availableForMeals.set(key, {
        name: matchedItem.name,
        quantity: matchedItem.quantity,
        meals: new Set(),
      });
    }
  }
  const availableMealIngredients = [...availableForMeals.values()].sort((a, b) => a.name.localeCompare(b.name));

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
            className="flex min-h-11 items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/60 text-sm font-medium hover:bg-muted transition-colors"
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
        <button
          type="button"
          onClick={() => { setDeleteListError(""); setDeleteListOpen(true); }}
          className="flex min-h-10 items-center gap-1.5 rounded-xl border border-destructive/25 px-3 text-xs font-bold text-destructive hover:bg-destructive/5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete list
        </button>
      </div>

      {itemActionError && (
        <p role="alert" className="text-sm font-medium text-destructive">{itemActionError}</p>
      )}

      <AlertDialog open={deleteListOpen} onOpenChange={setDeleteListOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shopping list?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every active and checked item. HomeHub will create a fresh empty Weekly Shopping list afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteListError && <p role="alert" className="text-sm font-medium text-destructive">{deleteListError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteList.isPending}>Keep list</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteList.isPending}
              onClick={event => {
                event.preventDefault();
                void handleDeleteList();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteList.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete Shopping List
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add form */}
      {addingOpen ? (
        <form onSubmit={handleAdd} className="bg-card p-3 rounded-2xl border-2 border-primary/20 shadow-sm space-y-3">
          <div>
            <label htmlFor="grocery-catalog-search" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Find an item
            </label>
            <div className="relative">
              <input
                id="grocery-catalog-search"
                ref={inputRef}
                autoFocus
                value={newItem}
                onChange={e => { setNewItem(e.target.value); setAddItemError(""); setAddItemMessage(""); }}
                placeholder="Search groceries and household items"
                autoComplete="off"
                className="w-full bg-background border border-border rounded-xl px-3 py-2 pr-9 text-sm focus:outline-none focus:border-primary font-medium"
              />
              {catalogLoading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCatalogCategory("")}
              className={`shrink-0 rounded-full border px-3 py-1.5 min-h-9 text-xs font-bold ${catalogCategory === "" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
            >
              All
            </button>
            {categoryOptions.map(cat => (
              <button
                key={`catalog-${cat.key}`}
                type="button"
                onClick={() => setCatalogCategory(cat.key as GroceryCategoryKey)}
                className={`shrink-0 rounded-full border px-3 py-1.5 min-h-9 text-xs font-bold ${catalogCategory === cat.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-1">
            {(catalogItems ?? []).map(item => (
              <button
                key={item.id}
                type="button"
                disabled={addItem.isPending}
                onClick={() => void addNamedItem(item.name, item.category)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm font-semibold hover:bg-primary/10 disabled:opacity-50"
              >
                <span>{item.name}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {ALL_CATEGORIES[item.category]?.label ?? "Other"}
                </span>
              </button>
            ))}
            {!catalogLoading && (catalogItems ?? []).length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                No catalog match. You can still add it as a custom item below.
              </p>
            )}
          </div>
          <input
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            placeholder="Quantity or note (e.g. 3 lbs, optional)"
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary font-medium"
          />
          <details>
            <summary className="min-h-9 cursor-pointer text-xs font-semibold text-muted-foreground">
              Custom item category: {ALL_CATEGORIES[newCategory]?.label ?? "Other"}
            </summary>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {categoryOptions.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setNewCategory(cat.key as GroceryCategoryKey)}
                  className={`px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-bold border transition-colors ${newCategory === cat.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </details>
          {addItemError && <p role="alert" className="text-sm font-medium text-destructive">{addItemError}</p>}
          {addItemMessage && <p role="status" className="text-sm font-medium text-primary">{addItemMessage}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAddingOpen(false); setAddItemError(""); setAddItemMessage(""); }} className="min-h-[44px] flex-1 rounded-xl border-2 border-border font-bold text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={addItem.isPending} className="min-h-[44px] flex-1 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              Add custom item
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAddingOpen(true)}
          className="min-h-[48px] w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-bold hover:bg-primary/5 hover:border-primary/50 transition-all"
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
            {group.label}
          </p>
          <div className="space-y-1.5">
            {group.items.map(item => (
              <div
                key={item.id}
                role="checkbox"
                aria-checked={false}
                tabIndex={0}
                onClick={() => handleCheck(item)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCheck(item); } }}
                className="flex items-center gap-3 px-3 py-3.5 min-h-14 bg-card rounded-xl border border-border/60 group hover:border-border active:bg-muted/50 transition-colors cursor-pointer select-none"
              >
                <span className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center shrink-0 group-hover:border-primary group-active:border-primary transition-colors" />
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                {item.quantity && <span className="text-xs text-muted-foreground font-medium">{item.quantity}</span>}
                <button onClick={e => { e.stopPropagation(); handleDelete(item.id); }} aria-label={`Delete ${item.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-all hover:text-destructive sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100">
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
          <div className="space-y-1.5">
            {checked.map(item => (
              <div
                key={item.id}
                role="checkbox"
                aria-checked={true}
                tabIndex={0}
                onClick={() => handleCheck(item)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCheck(item); } }}
                className="flex items-center gap-3 px-3 py-3.5 min-h-14 bg-muted/30 rounded-xl border border-border/30 group opacity-60 hover:opacity-80 active:opacity-90 transition-opacity cursor-pointer select-none"
              >
                <span className="w-7 h-7 rounded-full bg-primary border-2 border-primary flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </span>
                <span className="flex-1 text-sm font-medium line-through text-muted-foreground">{item.name}</span>
                {item.quantity && <span className="text-xs text-muted-foreground">{item.quantity}</span>}
                <button onClick={e => { e.stopPropagation(); handleDelete(item.id); }} aria-label={`Delete ${item.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-all hover:text-destructive sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {availableMealIngredients.length > 0 && (
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-3 flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Already in your kitchen</h3>
              <p className="text-xs text-muted-foreground">These ingredients are included in this week’s planned recipes. Check what remains before buying more.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {availableMealIngredients.map(item => (
              <div key={item.name.toLowerCase()} className="flex items-start justify-between gap-3 rounded-xl border border-primary/10 bg-card px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.meals.size > 0 ? [...item.meals].join(", ") : "Used in this week’s meal plan"}</p>
                </div>
                {item.quantity && <span className="shrink-0 text-xs font-medium text-primary">{item.quantity}</span>}
              </div>
            ))}
          </div>
        </section>
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
  const weekStart = format(monday, "yyyy-MM-dd");

  const { activeMember } = useActiveMember();

  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const members = familyMembers ?? [];

  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  const houseProperty = properties?.find(p => p.type === "house") ?? properties?.[0];

  const { data: inventory } = useGetInventory(houseProperty ? String(houseProperty.id) : "");

  const { data: meals, isLoading } = useGetMealPlans(
    { weekStart },
    { query: { queryKey: getGetMealPlansQueryKey({ weekStart }) } }
  );
  const createMeal = useCreateMealPlanEntry();
  const deleteMeal = useDeleteMealPlanEntry();
  const updateMeal = useUpdateMealPlanEntry();
  const upsertMeals = useUpsertMealPlanEntries();

  // Tab + UI state — declared before the recipe query so `activeTab` is in scope
  const [planWeekOpen, setPlanWeekOpen] = useState(false);
  const [deleteWeekOpen, setDeleteWeekOpen] = useState(false);
  const [isDeletingWeek, setIsDeletingWeek] = useState(false);
  const [deleteWeekError, setDeleteWeekError] = useState("");
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const viewParam = searchParams.get("view");

  const internalToUrl: Record<string, string> = {
    meals: "meal-plan",
    recipes: "cookbook",
    shopping: "shopping",
    inventory: "inventory"
  };
  const urlToInternal: Record<string, "meals" | "shopping" | "recipes" | "inventory"> = {
    "meal-plan": "meals",
    "cookbook": "recipes",
    "shopping": "shopping",
    "inventory": "inventory"
  };

  const urlTab = viewParam && urlToInternal[viewParam] ? urlToInternal[viewParam] : null;
  const activeTab = urlTab || (preferences.tabs.meals.defaultView as "meals" | "shopping" | "recipes" | "inventory") || "meals";

  const setActiveTab = (tab: "meals" | "shopping" | "recipes" | "inventory") => {
    const newParams = new URLSearchParams(searchString);
    newParams.set("view", internalToUrl[tab]);
    setLocation(`/meals?${newParams.toString()}`);
  };
  const [pendingRecipeName, setPendingRecipeName] = useState<string | null>(null);
  const [openRecipeName, setOpenRecipeName] = useState<string | null>(null);

  // Historical meals for suggestions
  const { data: allMeals } = useGetMealPlans(
    {},
    {
      query: {
        queryKey: getGetMealPlansQueryKey({}),
        enabled: activeTab === "meals",
      },
    }
  );

  const historicalMealsByType: Record<MealType, string[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };

  if (allMeals) {
    const currentWeekMealNames = new Set((meals ?? []).map(m => m.meal.toLowerCase().trim()));
    const seenByType: Record<MealType, Set<string>> = {
      breakfast: new Set(),
      lunch: new Set(),
      dinner: new Set(),
    };
    const sorted = [...allMeals].sort((a, b) => {
      const dateA = a.weekStart ? new Date(a.weekStart).getTime() : 0;
      const dateB = b.weekStart ? new Date(b.weekStart).getTime() : 0;
      return dateB - dateA;
    });

    for (const m of sorted) {
      if (houseProperty && String(m.propertyId) !== String(houseProperty.id)) continue;
      const name = m.meal.trim();
      const lower = name.toLowerCase();
      if (currentWeekMealNames.has(lower)) continue;

      if (!["breakfast", "lunch", "dinner"].includes(m.mealType)) continue;
      const type = m.mealType as MealType;
      if (seenByType[type].has(lower) || historicalMealsByType[type].length >= 40) continue;
      seenByType[type].add(lower);
      historicalMealsByType[type].push(name);
    }
  }

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
        enabled: !!houseProperty,
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

  const handleAdd = async (dayIndex: number, type: MealType, text: string, sourceUrl?: string) => {
    if (!houseProperty) throw new Error("Please set up a home first.");
    await createMeal.mutateAsync(
      {
        data: {
          weekStart,
          dayOfWeek: dayIndexToApi(dayIndex),
          mealType: type,
          meal: text,
          propertyId: houseProperty.id,
        },
      }
    );
    invalidateMeals();
  };

  const handleDelete = async (id: string) => {
    await deleteMeal.mutateAsync({ id });
    invalidateMeals();
  };

  const handleDeleteWeek = async () => {
    if (!meals?.length || isDeletingWeek) return;
    setIsDeletingWeek(true);
    setDeleteWeekError("");
    try {
      await Promise.all(meals.map(meal => deleteMeal.mutateAsync({ id: meal.id })));
      await invalidateMeals();
      setDeleteWeekOpen(false);
    } catch {
      setDeleteWeekError("Some meals could not be deleted. Please try again.");
    } finally {
      setIsDeletingWeek(false);
    }
  };

  const handleNote = async (id: string, notes: string) => {
    await updateMeal.mutateAsync({ id, data: { notes } });
    invalidateMeals();
  };

  const handleEditMeal = async (id: string, meal: string) => {
    await updateMeal.mutateAsync({ id, data: { meal } });
    invalidateMeals();
  };

  const handleSaveToCookbook = (name: string, sourceUrl?: string) => {
    if (!houseProperty) return;
    if (cookbookNames.has(name.toLowerCase().trim())) return;
    createRecipe.mutate(
      {
        data: {
          name,
          propertyId: String(houseProperty.id),
          sourceUrl: sourceUrl ?? null,
          notes: null,
          // Marks this as AI-originated so it's eligible for automatic
          // ingredient/instruction generation below, and so re-opening it
          // later (if generation hasn't finished yet) retries automatically.
          sourceType: "ai",
        },
      },
      {
        onSuccess: (saved) => {
          invalidateRecipes();
          // Fire-and-forget: fills in the recipe in the background. If it
          // fails (or the tab closes mid-request), opening the entry later
          // in the Cookbook retries automatically, since it's still marked
          // AI-sourced with no instructions yet.
          void fetchAndSaveAiRecipeDetails(saved, (args) => updateRecipe.mutateAsync(args))
            .then(invalidateRecipes)
            .catch(() => {});
        },
      }
    );
  };

  const handleImportUrlRecipe = async (
    dayIndex: number,
    mealType: MealType,
    recipe: ImportedUrlRecipe,
    sourceUrl: string,
  ) => {
    if (!houseProperty) throw new Error("Add a home property before importing a recipe.");

    const normalizedName = recipe.name.trim().toLowerCase();
    const existingRecipe = (recipes ?? []).find(item => item.name.trim().toLowerCase() === normalizedName);
    const structuredRecipe = {
      name: recipe.name.trim(),
      sourceUrl,
      ingredients: recipe.ingredients
        .filter(item => item.name.trim())
        .map(item => ({
          name: item.name.trim(),
          quantity: item.quantity?.trim() || undefined,
          category: resolveCategory(item.category),
        })),
      instructions: recipe.instructions.map(step => step.trim()).filter(Boolean),
      servings: recipe.servings ?? undefined,
      prepMinutes: recipe.prepMinutes ?? undefined,
      cookMinutes: recipe.cookMinutes ?? undefined,
      sourceType: "url" as const,
      notes: null,
    };

    if (existingRecipe) {
      await updateRecipe.mutateAsync({ id: existingRecipe.id, data: structuredRecipe });
    } else {
      await createRecipe.mutateAsync({
        data: { ...structuredRecipe, propertyId: String(houseProperty.id) },
      });
    }

    await createMeal.mutateAsync({
      data: {
        weekStart,
        dayOfWeek: dayIndexToApi(dayIndex),
        mealType,
        meal: recipe.name.trim(),
        propertyId: houseProperty.id,
      },
    });
    await Promise.all([invalidateRecipes(), invalidateMeals()]);
  };

  const handleChat = async (messages: {role: 'user'|'assistant', content: string}[]) => {
    if (!houseProperty) throw new Error("Add a home property before planning meals.");
    const existingMeals = (meals ?? []).map(m => {
      const idx = apiDayToIndex(m.dayOfWeek);
      return {
        dayName: DAYS[idx],
        mealType: m.mealType,
        meal: m.meal,
      };
    });

    const res = await fetch(`/api/ai/meal-plan-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        existingMeals
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to chat. Please try again.");
    return data.message;
  };

  const handleAISuggestWeek = async (plannerMessages: {role: 'user'|'assistant', content: string}[], imagesBase64: string[]) => {
    if (!houseProperty) {
      throw new Error("Add a home property before planning meals.");
    }

    // Collect existing meals to guide AI
    const existingMeals = (meals ?? []).map(m => {
      const idx = apiDayToIndex(m.dayOfWeek);
      return {
        dayName: DAYS[idx],
        mealType: m.mealType,
        meal: m.meal,
      };
    });

    const res = await fetch(`/api/ai/suggest-week`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannerMessages, imagesBase64, existingMeals }),
    });

    // Save inventory snapshot if at least 2 photos were provided
    if (res.ok) {
      const cloned = res.clone();
      try {
        const data = await cloned.json();
        if (imagesBase64.length >= 2 && Array.isArray(data.inventory)) {
          const inventoryResponse = await fetch(`/api/kitchen-inventory`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId: String(houseProperty.id), items: data.inventory })
          });
          if (!inventoryResponse.ok) {
            const errorBody = await inventoryResponse.json().catch(() => null);
            throw new Error(errorBody?.error || "The kitchen inventory could not be updated.");
          }
          queryClient.invalidateQueries({ queryKey: ["kitchen-inventory", String(houseProperty.id)] });
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error("The kitchen inventory could not be updated.");
      }
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new Error(errorBody?.error || "We couldn't build that meal plan. Please try again.");
    }

    const data = await res.json();
    if (!Array.isArray(data?.days)) {
      throw new Error("The meal plan response was incomplete. Please try again.");
    }

    const dayNameToIndex: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
      friday: 4, saturday: 5, sunday: 6,
    };

    const newMeals: Array<{ dayIndex: number; type: MealType; text: string }> = [];
    for (const day of data.days) {
      const idx = dayNameToIndex[day.dayName?.toLowerCase()] ?? -1;
      if (idx === -1) continue;

      for (const [mType, value] of [
        ["breakfast", day.breakfast],
        ["lunch", day.lunch],
        ["dinner", day.dinner],
      ] as [MealType, string][]) {
        if (typeof value !== "string" || !value.trim()) continue;

        newMeals.push({ dayIndex: idx, type: mType, text: value.trim() });
      }
    }

    if (newMeals.length > 0) {
      await upsertMeals.mutateAsync({
        data: {
          fillEmptyOnly: true,
          items: newMeals.map((meal) => ({
            weekStart,
            dayOfWeek: dayIndexToApi(meal.dayIndex),
            mealType: meal.type,
            meal: meal.text,
            propertyId: String(houseProperty.id),
          })),
        },
      });

      try {
        const existingRecipeNames = new Set((recipes ?? []).map(recipe => recipe.name.trim().toLowerCase()));
        const suggestedRecipeNames = [...new Set(
          newMeals
            .map(meal => meal.text.trim())
            .filter(name => !/eat(?:ing)? out|restaurant|takeout|leftovers?/i.test(name))
        )];
        await Promise.allSettled(
          suggestedRecipeNames
            .filter(name => !existingRecipeNames.has(name.toLowerCase()))
            .map(name => createRecipe.mutateAsync({
              data: {
                name,
                propertyId: String(houseProperty.id),
                sourceUrl: null,
                notes: null,
                ingredients: [],
                instructions: [],
                sourceType: "ai",
              },
            }))
        );
      } finally {
        await Promise.all([invalidateMeals(), invalidateRecipes()]);
      }
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

        <div className="flex flex-wrap items-center gap-2">
          {houseProperty && (
            <>
              {/* Week navigation */}
              <div className="flex shrink-0 items-center bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setWeekOffset(w => w - 1)}
                  className="px-3 py-2.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span
                  className="min-w-[7.75rem] px-3 py-2.5 text-center text-sm font-bold text-foreground"
                  aria-label={`Viewing ${format(monday, "MMMM d")} through ${format(addDays(monday, 6), "MMMM d, yyyy")}`}
                >
                  {format(monday, "MMM d")}–{format(addDays(monday, 6), "MMM d")}
                </span>
                <button
                  onClick={() => setWeekOffset(w => w + 1)}
                  className="px-3 py-2.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* AI Plan */}
              <button
                onClick={() => setPlanWeekOpen(true)}
                className="flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
                data-testid="button-open-plan-week"
              >
                <Sparkles className="w-4 h-4" />
                Plan My Week
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteWeekError("");
                  setDeleteWeekOpen(true);
                }}
                disabled={!meals?.length || isDeletingWeek}
                className="flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl border border-destructive/30 bg-card text-destructive font-bold text-sm hover:bg-destructive/5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="button-delete-week"
              >
                <Trash2 className="w-4 h-4" />
                Delete Week
              </button>
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={deleteWeekOpen}
        onOpenChange={open => {
          if (!isDeletingWeek) setDeleteWeekOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this week’s meal plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {meals?.length ?? 0} planned meals for {format(monday, "MMM d")}–{format(addDays(monday, 6), "MMM d")}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteWeekError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteWeekError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingWeek}>Keep Week</AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                void handleDeleteWeek();
              }}
              disabled={isDeletingWeek}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingWeek ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete Week"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tabs */}
      <div className="grid w-full max-w-2xl grid-cols-4 gap-1 rounded-xl bg-muted/50 p-1 mb-6" role="tablist" aria-label="Meal and shopping views">
        {[
          { key: "meals",    label: "Meal Plan" },
          { key: "shopping", label: "Shopping List" },
          { key: "inventory",label: "Inventory" },
          { key: "recipes",  label: "Cookbook" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`min-w-0 px-1.5 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all ${activeTab === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!houseProperty && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
          <BookOpen className="h-8 w-8 opacity-20" />
          <p className="text-sm font-medium">Please set up a home first to manage meals and shopping.</p>
        </div>
      )}

      {houseProperty && pendingRecipeName && activeTab === "meals" && (
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
                    const suggestions = [
                      ...historicalMealsByType[mt.type],
                      ...(recipes ?? []).map(recipe => recipe.name),
                    ];
                    return (
                      <MealSlot
                        key={mt.type}
                        meal={existing}
                        mealType={mt}
                        dayLabel={day}
                        pendingFill={!existing && pendingRecipeName ? pendingRecipeName : undefined}
                        onAdd={async (text, sourceUrl) => {
                          await handleAdd(idx, mt.type, text, sourceUrl);
                          // Clear pending recipe after any successful add
                          if (pendingRecipeName) setPendingRecipeName(null);
                        }}
                        onEdit={handleEditMeal}
                        onDelete={async () => {
                          if (existing) await handleDelete(existing.id);
                        }}
                        onNote={handleNote}
                        onSaveToCookbook={handleSaveToCookbook}
                        onImportUrl={(recipe, sourceUrl) => handleImportUrlRecipe(idx, mt.type, recipe, sourceUrl)}
                        propertyId={propertyIdStr}
                        cookbookNames={cookbookNames}
                        members={members}
                        activeMemberId={activeMember ? activeMember.id : null}
                        suggestions={suggestions}
                        onOpenRecipe={(name) => {
                          setPendingRecipeName(null);
                          setActiveTab("recipes");
                          setOpenRecipeName(name);
                        }}
                        matchedInventory={
                          existing
                            ? getMatchedInventoryNames(
                                recipes?.find(r => r.name.toLowerCase() === existing.meal.toLowerCase())?.ingredients ?? [],
                                inventory ?? []
                              )
                            : undefined
                        }
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
              inventory={inventory ?? []}
              meals={(meals ?? []).map(m => ({
                dayName: DAYS[apiDayToIndex(m.dayOfWeek)] ?? "Day",
                mealType: m.mealType,
                meal: m.meal,
              }))}
              recipes={(recipes ?? [])
                .filter(recipe => recipe.ingredients.length > 0)
                .map(recipe => ({ name: recipe.name, ingredients: recipe.ingredients }))}
            />
          ) : (
            <div className="text-muted-foreground py-8 text-center animate-pulse">Loading…</div>
          )}
        </div>
      ) : activeTab === "inventory" ? (
        <InventorySection propertyId={propertyIdStr} />
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
          <CookbookSection propertyId={propertyIdStr} onUseRecipe={handleUseRecipe} inventory={inventory ?? []} focusRecipeName={openRecipeName} onClearFocus={() => setOpenRecipeName(null)} />
        </div>
      )}

      <PlanWeekDialog
        open={planWeekOpen}
        onOpenChange={setPlanWeekOpen}
        onChat={handleChat}
        onPlan={handleAISuggestWeek}
      />
    </div>
  );
}

// Asks the AI for a full recipe (ingredients + steps) for an existing
// AI-sourced cookbook entry and saves the result onto it. Shared so both the
// Cookbook's own "open to fill in details" flow and the "save straight from
// an AI meal suggestion" flow produce the same fully-detailed recipe.
async function fetchAndSaveAiRecipeDetails(
  recipe: { id: string; name: string; instructions: string[] },
  updateRecipeMutateAsync: (args: { id: string; data: Record<string, unknown> }) => Promise<unknown>,
): Promise<void> {
  if (recipe.instructions.length > 0) return;
  const response = await fetch("/api/ai/meal-recipe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meal: recipe.name, generateImage: false }),
  });
  const data = await response.json().catch(() => null) as {
    recipe?: {
      ingredients?: string[];
      steps?: string[];
      servings?: number;
      prepTime?: string;
      cookTime?: string;
    };
    error?: string;
  } | null;
  if (!response.ok || !data?.recipe) {
    throw new Error(data?.error || "Could not create this recipe.");
  }
  const details = data.recipe;
  const ingredients = (details.ingredients ?? [])
    .filter(item => typeof item === "string" && item.trim())
    .map(item => ({ name: item.trim(), category: "other" }));
  const instructions = (details.steps ?? []).filter(step => typeof step === "string" && step.trim());
  if (!ingredients.length || !instructions.length) throw new Error("The generated recipe was incomplete.");

  await updateRecipeMutateAsync({
    id: recipe.id,
    data: {
      ingredients,
      instructions,
      servings: Number.isInteger(details.servings) ? details.servings : null,
      prepMinutes: Number.parseInt(details.prepTime ?? "", 10) || null,
      cookMinutes: Number.parseInt(details.cookTime ?? "", 10) || null,
      sourceType: "ai",
    },
  });
}

function CookbookSection({ propertyId, onUseRecipe, inventory, focusRecipeName, onClearFocus }: { propertyId: string; onUseRecipe?: (name: string) => void; inventory?: KitchenInventoryItem[]; focusRecipeName?: string | null; onClearFocus?: () => void }) {
  const queryClient = useQueryClient();
  const params = { propertyId };
  const { data: recipes, isLoading } = useGetRecipes(params, { query: { queryKey: getGetRecipesQueryKey(params) } });
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<Record<string, string>>({});
  const [cookingRecipeId, setCookingRecipeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [noteError, setNoteError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  React.useEffect(() => {
    if (focusRecipeName && recipes) {
      const found = recipes.find(r => r.name.toLowerCase() === focusRecipeName.toLowerCase());
      if (found) {
        setExpandedId(found.id);
        if (found.sourceType === "ai" && found.instructions.length === 0) {
          void generateRecipeDetails(found);
        }
      }
      onClearFocus?.();
    }
  }, [focusRecipeName, recipes]); // onClearFocus omitted to prevent loops

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetRecipesQueryKey(params) });

  const getMutationError = (error: unknown) => {
    const apiError = error as { data?: { error?: string }; message?: string };
    return apiError.data?.error || apiError.message || "Something went wrong.";
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddError("");
    createRecipe.mutate(
      { data: { name: newName.trim(), propertyId, sourceUrl: newUrl.trim() || null, notes: newNotes.trim() || null } },
      {
        onSuccess: () => {
          setNewName(""); setNewUrl(""); setNewNotes("");
          setAdding(false);
          invalidate();
        },
        onError: (err) => {
          setAddError(getMutationError(err));
        }
      }
    );
  };

  const handleDelete = (id: string) => {
    const recipe = (recipes ?? []).find(r => r.id === id);
    setDeleteError("");
    deleteRecipe.mutate(
      { id },
      {
        onSuccess: invalidate,
        onError: (error) => setDeleteError(`Couldn't remove ${recipe?.name ?? "that recipe"}: ${getMutationError(error)}`),
      },
    );
  };

  const handleSaveNotes = (id: string) => {
    setNoteError("");
    updateRecipe.mutate({ id, data: { notes: editNotes || null } }, {
      onSuccess: () => { setEditingId(null); invalidate(); },
      onError: (err) => setNoteError(getMutationError(err)),
    });
  };

  const generateRecipeDetails = async (recipe: NonNullable<typeof recipes>[number]) => {
    if (generatingId || recipe.instructions.length > 0) return;
    setGeneratingId(recipe.id);
    setGenerationError(current => ({ ...current, [recipe.id]: "" }));
    try {
      await fetchAndSaveAiRecipeDetails(recipe, (args) => updateRecipe.mutateAsync(args));
      await invalidate();
    } catch (error) {
      setGenerationError(current => ({
        ...current,
        [recipe.id]: error instanceof Error ? error.message : "Could not create this recipe.",
      }));
    } finally {
      setGeneratingId(null);
    }
  };

  const handleExpandRecipe = (recipe: NonNullable<typeof recipes>[number]) => {
    const opening = expandedId !== recipe.id;
    setExpandedId(opening ? recipe.id : null);
    if (opening && recipe.sourceType === "ai" && recipe.instructions.length === 0) {
      void generateRecipeDetails(recipe);
    }
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
          className="flex min-h-9 items-center gap-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
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
              className="flex-1 min-h-[44px] rounded-xl border-2 border-border font-bold text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createRecipe.isPending || !newName.trim()}
              className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Save Recipe
            </button>
          </div>
          {addError && <p role="alert" className="text-xs font-medium text-destructive">{addError}</p>}
        </form>
      )}

      {/* Recipe list */}
      {deleteError && (
        <p role="alert" className="text-sm font-medium text-destructive mb-3">{deleteError}</p>
      )}
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
                onClick={() => handleExpandRecipe(recipe)}
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
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium flex items-center gap-1 ${ratingBadge.cls}`}>
                        <ratingBadge.Icon className="w-3 h-3" /> {ratingBadge.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Start guided (read-aloud) cooking, right from the list */}
                  {recipe.instructions.length > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); setCookingRecipeId(recipe.id); }}
                      title="Cook with guided, read-aloud steps"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-all"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                  {generatingId === recipe.id && (
                    <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-3 text-sm text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating ingredients and cooking steps…
                    </div>
                  )}
                  {generationError[recipe.id] && (
                    <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                      <p>{generationError[recipe.id]}</p>
                      <button
                        type="button"
                        onClick={() => void generateRecipeDetails(recipe)}
                        className="mt-2 font-bold underline"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {recipe.ingredients.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Ingredients</p>
                      <ul className="space-y-1 text-sm">
                        {recipe.ingredients.map((ingredient, index) => {
                          const isMatched = inventory && getMatchedInventoryNames([ingredient], inventory).length > 0;
                          return (
                            <li key={`${ingredient.name}-${index}`} className="flex gap-2 items-start">
                              <span className={`mt-0.5 ${isMatched ? "text-primary" : "text-muted-foreground"}`}>•</span>
                              <div className="flex-1 flex flex-wrap items-center gap-2">
                                <span className={isMatched ? "font-medium" : ""}>
                                  {ingredient.quantity ? `${ingredient.quantity} ` : ""}{ingredient.name}
                                </span>
                                {isMatched && (
                                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 leading-none">
                                    Have it
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {recipe.instructions.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Instructions</p>
                      <ol className="space-y-2 text-sm">
                        {recipe.instructions.map((step, index) => (
                          <li key={index} className="flex gap-3">
                            <span className="font-bold text-primary">{index + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      <button
                        type="button"
                        onClick={() => setCookingRecipeId(recipe.id)}
                        className="mt-3 min-h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground"
                      >
                        <Headphones className="mr-2 inline h-4 w-4" />
                        Start Guided Cooking
                      </button>
                      <IngredientShopping propertyId={propertyId} recipe={recipe} />
                    </div>
                  )}

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
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <textarea
                          autoFocus
                          value={editNotes}
                          onChange={e => { setEditNotes(e.target.value); setNoteError(""); }}
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
                            onClick={() => { setEditingId(null); setNoteError(""); }}
                            className="w-7 h-7 flex items-center justify-center border border-border rounded-lg text-muted-foreground"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {noteError && <p role="alert" className="text-xs font-medium text-destructive">{noteError}</p>}
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
      {cookingRecipeId && (() => {
        const cookingRecipe = recipes?.find(recipe => recipe.id === cookingRecipeId);
        return cookingRecipe
          ? <GuidedCooking recipe={cookingRecipe} onClose={() => setCookingRecipeId(null)} />
          : null;
      })()}
    </div>
  );
}
