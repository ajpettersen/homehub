import { useState } from "react";
import { useScanPantry } from "@workspace/api-client-react";
import { Camera, Check, Loader2, Sparkles, X } from "lucide-react";
import { ImagePicker, type PickedImage } from "./ImagePicker";

export function PantryScanner({ onAddMeal }: { onAddMeal: (name: string) => void }) {
  const [images, setImages] = useState<PickedImage[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ ingredients: string[]; mealSuggestions: Array<{ name: string; description: string; missingIngredients: string[] }> } | null>(null);
  const scan = useScanPantry();
  const addImages = (picked: PickedImage[]) => {
    if (picked.some(p => p.size < 0)) { setError(picked[0].name); return; }
    setError(""); setImages(current => [...current, ...picked].slice(0, 6));
  };
  const submit = () => {
    if (!images.length) return;
    setError("");
    scan.mutate({ data: { imagesBase64: images.map(image => image.dataUrl) } }, {
      onSuccess: setResult,
      onError: () => setError("We couldn't read those photos. Try a brighter, closer view."),
    });
  };
  return (
    <section data-testid="pantry-scanner" className="mb-6 rounded-3xl border border-primary/15 bg-[#fff8ed] p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <div className="rounded-2xl bg-primary/10 p-2.5"><Camera className="h-5 w-5 text-primary" /></div>
        <div><h3 className="font-serif text-lg font-bold">What can we make?</h3><p className="text-sm text-muted-foreground">Show us the fridge, pantry, or freezer. We’ll spot what’s ready to use.</p></div>
      </div>
      <ImagePicker multiple onPick={addImages} />
      {error && <p data-testid="status-pantry-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {images.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => <div key={`${image.name}-${index}`} className="relative shrink-0"><img data-testid={`img-pantry-preview-${index}`} src={image.dataUrl} alt={`Selected pantry photo ${index + 1}`} className="h-16 w-16 rounded-xl object-cover" /><button type="button" aria-label={`Remove pantry photo ${index + 1}`} title="Remove photo" data-testid={`button-remove-pantry-${index}`} onClick={() => setImages(list => list.filter((_, i) => i !== index))} className="absolute -right-1 -top-1 rounded-full bg-foreground p-1 text-background"><X className="h-3 w-3" /></button></div>)}
        </div>
      )}
      <button type="button" data-testid="button-scan-pantry" disabled={!images.length || scan.isPending} onClick={submit} className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground disabled:opacity-50">
        {scan.isPending ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Looking closely…</> : <><Sparkles className="mr-2 inline h-4 w-4" />Find meals from these photos</>}
      </button>
      {result && <div data-testid="pantry-results" className="mt-4 space-y-3 border-t border-primary/10 pt-4">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">I found</p><p className="text-sm">{result.ingredients.join(" · ") || "No ingredients were certain enough to list."}</p></div>
        <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Try this</p>{result.mealSuggestions.map((meal, index) => <div data-testid={`card-meal-suggestion-${index}`} key={`${meal.name}-${index}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"><div className="min-w-0 flex-1"><p className="font-semibold">{meal.name}</p><p className="text-xs text-muted-foreground">{meal.description}</p>{meal.missingIngredients.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Needs: {meal.missingIngredients.join(", ")}</p>}</div><button type="button" data-testid={`button-add-suggestion-${index}`} onClick={() => onAddMeal(meal.name)} className="min-h-11 shrink-0 rounded-xl bg-primary/10 px-3 text-xs font-bold text-primary"><Check className="mr-1 inline h-3.5 w-3.5" />Plan</button></div>)}</div>
      </div>}
    </section>
  );
}