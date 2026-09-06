import { useState } from "react";
import { useExtractRecipeImage, useCreateRecipe, getGetRecipesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FileImage, Loader2, Plus, Save, Trash2, AlertTriangle } from "lucide-react";
import { ImagePicker, type PickedImage } from "./ImagePicker";

type Ingredient = { name: string; quantity?: string; category?: string };
type Draft = { name: string; ingredients: Ingredient[]; instructions: string[]; servings?: number | null; prepMinutes?: number | null; cookMinutes?: number | null; confidence: number; warnings: string[] };
const CATEGORY_OPTIONS = [
  ["produce", "Produce"], ["deli", "Deli & lunch meat"], ["meat", "Meat & seafood"], ["dairy", "Dairy & eggs"],
  ["bread", "Bread & bakery"], ["grains", "Grains & pasta"], ["canned", "Canned & pantry"], ["snacks", "Snacks"],
  ["frozen", "Frozen"], ["beverages", "Beverages"], ["household", "Household"], ["other", "Other"],
] as const;
function normalizeCategory(category?: string) {
  const value = (category ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = { protein: "meat", seafood: "meat", bakery: "bread", pantry: "canned", canned_goods: "canned", dairy_eggs: "dairy" };
  return aliases[value] ?? (CATEGORY_OPTIONS.some(([key]) => key === value) ? value : "other");
}

export function RecipeImport({ propertyId, onSaved }: { propertyId: string; onSaved?: (recipe: { id: string; name: string }) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const extract = useExtractRecipeImage();
  const create = useCreateRecipe();
  const queryClient = useQueryClient();
  const choose = (picked: PickedImage[]) => {
    if (!picked[0] || picked[0].size < 0) { setError(picked[0]?.name ?? "Please choose a photo."); return; }
    setError(""); extract.mutate({ data: { image: picked[0].dataUrl } }, { onSuccess: value => setDraft({ ...value, ingredients: value.ingredients.map(item => ({ ...item, category: normalizeCategory(item.category) })) }), onError: () => setError("We couldn't read that recipe. A flatter, brighter photo usually helps.") });
  };
  const save = () => {
    if (!draft || !draft.name.trim()) return;
    create.mutate({ data: { name: draft.name.trim(), propertyId, ingredients: draft.ingredients.filter(i => i.name.trim()), instructions: draft.instructions.filter(Boolean), servings: draft.servings ?? undefined, prepMinutes: draft.prepMinutes ?? undefined, cookMinutes: draft.cookMinutes ?? undefined, sourceType: "image", notes: null } }, {
      onSuccess: recipe => { queryClient.invalidateQueries({ queryKey: getGetRecipesQueryKey({ propertyId }) }); setDraft(null); onSaved?.(recipe); },
      onError: () => setError("That recipe could not be saved. Please try again."),
    });
  };
  const updateIngredient = (index: number, key: keyof Ingredient, value: string) => setDraft(valueDraft => valueDraft && ({ ...valueDraft, ingredients: valueDraft.ingredients.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  return (
    <section data-testid="recipe-import" className="mb-5 rounded-3xl border border-primary/15 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3"><div className="rounded-2xl bg-primary/10 p-2.5"><FileImage className="h-5 w-5 text-primary" /></div><div><h3 className="font-serif text-lg font-bold">Save a recipe from a photo</h3><p className="text-sm text-muted-foreground">Take a picture of a cookbook page or screen. Review everything before it enters your cookbook.</p></div></div>
      {!draft && <ImagePicker onPick={choose} />}
      {error && <p data-testid="status-recipe-import-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {extract.isPending && <p data-testid="status-recipe-import-loading" className="mt-4 rounded-2xl bg-muted/60 p-3 text-sm"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Reading the recipe carefully…</p>}
      {draft && <div data-testid="recipe-review" className="mt-4 space-y-4 border-t border-border pt-4">
        <div><label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label><input data-testid="input-recipe-title" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base font-semibold" /></div>
        {(draft.warnings.length > 0 || draft.confidence < .7) && <div data-testid="recipe-review-warning" className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Confidence {Math.round(draft.confidence * 100)}%. {draft.warnings.join(" ")}</div>}
         <div><div className="mb-2 flex items-center justify-between"><h4 className="font-semibold">Ingredients</h4><button type="button" data-testid="button-add-ingredient" onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, { name: "", quantity: "", category: "other" }] })} className="min-h-11 rounded-xl px-2 text-primary"><Plus className="mr-1 inline h-4 w-4" />Add</button></div>{draft.ingredients.map((item, index) => <div key={index} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><input data-testid={`input-ingredient-name-${index}`} value={item.name} onChange={e => updateIngredient(index, "name", e.target.value)} placeholder="Ingredient" className="min-h-11 min-w-0 rounded-xl border border-border bg-background px-2 text-sm" /><input data-testid={`input-ingredient-quantity-${index}`} value={item.quantity ?? ""} onChange={e => updateIngredient(index, "quantity", e.target.value)} placeholder="Quantity" className="min-h-11 min-w-0 rounded-xl border border-border bg-background px-2 text-sm" /><select data-testid={`select-ingredient-category-${index}`} aria-label={`Category for ingredient ${index + 1}`} title="Ingredient category" value={normalizeCategory(item.category)} onChange={e => updateIngredient(index, "category", e.target.value)} className="min-h-11 min-w-0 rounded-xl border border-border bg-background px-2 text-sm">{CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" aria-label={`Remove ingredient ${index + 1}`} title="Remove ingredient" data-testid={`button-remove-ingredient-${index}`} onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, i) => i !== index) })} className="min-h-11 min-w-11 rounded-xl text-muted-foreground hover:text-destructive"><Trash2 className="mx-auto h-4 w-4" /></button></div>)}</div>
        <div><div className="mb-2 flex items-center justify-between"><h4 className="font-semibold">Instructions</h4><button type="button" data-testid="button-add-step" onClick={() => setDraft({ ...draft, instructions: [...draft.instructions, ""] })} className="min-h-11 rounded-xl px-2 text-primary"><Plus className="mr-1 inline h-4 w-4" />Add step</button></div>{draft.instructions.map((step, index) => <div key={index} className="mb-2 flex gap-2"><span className="flex h-11 w-7 shrink-0 items-center justify-center font-serif text-lg text-primary">{index + 1}</span><textarea data-testid={`input-recipe-step-${index}`} value={step} onChange={e => setDraft({ ...draft, instructions: draft.instructions.map((s, i) => i === index ? e.target.value : s) })} rows={2} className="min-w-0 flex-1 rounded-xl border border-border bg-background p-2 text-sm" /><button type="button" data-testid={`button-remove-step-${index}`} onClick={() => setDraft({ ...draft, instructions: draft.instructions.filter((_, i) => i !== index) })} className="min-h-11 min-w-11 rounded-xl text-muted-foreground hover:text-destructive"><Trash2 className="mx-auto h-4 w-4" /></button></div>)}</div>
        <div className="grid grid-cols-3 gap-2"><input data-testid="input-recipe-servings" type="number" value={draft.servings ?? ""} onChange={e => setDraft({ ...draft, servings: Number(e.target.value) || null })} placeholder="Serves" className="min-h-11 rounded-xl border border-border bg-background px-2 text-sm" /><input data-testid="input-recipe-prep" type="number" value={draft.prepMinutes ?? ""} onChange={e => setDraft({ ...draft, prepMinutes: Number(e.target.value) || null })} placeholder="Prep min" className="min-h-11 rounded-xl border border-border bg-background px-2 text-sm" /><input data-testid="input-recipe-cook" type="number" value={draft.cookMinutes ?? ""} onChange={e => setDraft({ ...draft, cookMinutes: Number(e.target.value) || null })} placeholder="Cook min" className="min-h-11 rounded-xl border border-border bg-background px-2 text-sm" /></div>
        <div className="flex gap-2"><button type="button" data-testid="button-discard-recipe-review" onClick={() => setDraft(null)} className="min-h-11 flex-1 rounded-xl border border-border font-semibold">Discard</button><button type="button" data-testid="button-save-imported-recipe" disabled={create.isPending || !draft.name.trim()} onClick={save} className="min-h-11 flex-1 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">{create.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <><Save className="mr-2 inline h-4 w-4" />Save recipe</>}</button></div>
      </div>}
    </section>
  );
}