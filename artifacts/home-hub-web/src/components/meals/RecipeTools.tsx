import { useEffect, useRef, useState } from "react";
import { useAddGroceryItem, useCreateGroceryList, useGetGroceryItems, useGetGroceryLists, getGetGroceryItemsQueryKey, getGetGroceryListsQueryKey, useReadRecipeStep } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CirclePause, CirclePlay, Headphones, List, Loader2, ShoppingCart, Square, X } from "lucide-react";

type Ingredient = { name: string; quantity?: string; category?: string };
type RecipeLike = { id: string; name: string; ingredients?: Ingredient[]; instructions?: string[] };
const CATEGORY_ALIASES: Record<string, string> = { protein: "meat", seafood: "meat", bakery: "bread", pantry: "canned", canned_goods: "canned", dairy_eggs: "dairy" };
const normalizeCategory = (category?: string) => {
  const value = (category ?? "").trim().toLowerCase();
  return CATEGORY_ALIASES[value] ?? (["produce", "deli", "meat", "dairy", "bread", "grains", "canned", "snacks", "frozen", "beverages", "household", "other"].includes(value) ? value : "other");
};

export function IngredientShopping({ propertyId, recipe }: { propertyId: string; recipe: RecipeLike }) {
  const ingredients = recipe.ingredients ?? [];
  const [selected, setSelected] = useState(() => new Set(ingredients.map((_, i) => i)));
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();
  const { data: lists } = useGetGroceryLists({ query: { queryKey: getGetGroceryListsQueryKey() } });
  const list = lists?.find(item => String(item.propertyId) === String(propertyId));
  const { data: existing } = useGetGroceryItems(list?.id ?? "", { query: { queryKey: getGetGroceryItemsQueryKey(list?.id ?? ""), enabled: !!list?.id } });
  const createList = useCreateGroceryList();
  const add = useAddGroceryItem();
  const toggle = (i: number) => setSelected(current => { const next = new Set(current); next.has(i) ? next.delete(i) : next.add(i); return next; });
  const addSelected = async () => {
    setStatus("");
    let target = list;
    if (!target) {
      try { target = await new Promise<any>((resolve, reject) => createList.mutate({ data: { name: "Weekly Shopping", propertyId } }, { onSuccess: resolve, onError: reject })); queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() }); } catch { setStatus("Could not create a shopping list."); return; }
    }
    const seen = new Set((existing ?? []).map(item => item.name.trim().toLowerCase()));
    const chosen = ingredients.filter((_, i) => selected.has(i));
    let added = 0;
    for (const item of chosen) if (!seen.has(item.name.trim().toLowerCase())) {
      try { await new Promise<void>((resolve, reject) => add.mutate({ id: target!.id, data: { name: item.name, quantity: item.quantity ?? null, category: normalizeCategory(item.category) } }, { onSuccess: () => resolve(), onError: reject })); seen.add(item.name.trim().toLowerCase()); added++; } catch { /* report below */ }
    }
    if (target) {
      queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(target.id) });
      queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
    }
    setStatus(added ? `${added} ingredient${added === 1 ? "" : "s"} added to your shopping list.` : "Those ingredients are already on your shopping list.");
  };
  if (!ingredients.length) return null;
  return <div data-testid={`ingredient-shopping-${recipe.id}`} className="mt-3 rounded-2xl border border-border bg-background p-3"><div className="mb-2 flex items-center justify-between"><p className="font-semibold">Add ingredients to list</p><span className="text-xs text-muted-foreground">{selected.size} selected</span></div>{ingredients.map((item, i) => <label key={`${item.name}-${i}`} data-testid={`checkbox-ingredient-${recipe.id}-${i}`} className="flex min-h-11 items-center gap-3 border-b border-border/50 py-2 text-sm last:border-0"><input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="h-5 w-5 accent-[hsl(var(--primary))]" /><span className="flex-1">{item.name}</span><span className="text-xs text-muted-foreground">{item.quantity}</span></label>)}<button type="button" data-testid={`button-add-ingredients-${recipe.id}`} disabled={!selected.size || add.isPending || createList.isPending} onClick={() => void addSelected()} className="mt-3 min-h-11 w-full rounded-xl bg-primary/10 font-bold text-primary disabled:opacity-50"><ShoppingCart className="mr-2 inline h-4 w-4" />Add selected to Shopping List</button>{status && <p data-testid={`status-grocery-${recipe.id}`} role="status" className="mt-2 text-center text-sm text-primary">{status}</p>}</div>;
}

export function GuidedCooking({ recipe, onClose }: { recipe: RecipeLike; onClose: () => void }) {
  const steps = recipe.instructions ?? [];
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const read = useReadRecipeStep();
  const step = steps[current] ?? "";
  const cleanupAudio = () => {
    const player = audioRef.current;
    if (player) {
      player.pause();
      player.onended = null;
      player.onerror = null;
      player.removeAttribute("src");
      player.load();
      audioRef.current = null;
    }
    if (urlRef.current?.startsWith("blob:")) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    if (mountedRef.current) { setPlaying(false); setPaused(false); }
  };
  useEffect(() => {
    const lock = "wakeLock" in navigator ? (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock : undefined;
    let sentinel: { release: () => Promise<void> } | undefined;
    void lock?.request("screen").then(value => {
      if (!mountedRef.current) { void value.release(); return; }
      sentinel = value;
    }).catch(() => undefined);
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      cleanupAudio();
      void sentinel?.release();
    };
  }, []);
  const selectStep = (index: number) => { requestGenerationRef.current += 1; cleanupAudio(); setCurrent(index); setError(""); requestAudio(index); };
  const requestAudio = (index = current) => {
    const text = steps[index]; if (!text) return;
    const generation = ++requestGenerationRef.current;
    cleanupAudio(); setError("");
    read.mutate({ data: { text, recipeName: recipe.name, stepNumber: index + 1 } }, {
      onSuccess: audio => {
        if (!mountedRef.current || generation !== requestGenerationRef.current) return;
        const url = `data:${audio.mimeType};base64,${audio.audioBase64}`;
        const player = new Audio(url);
        audioRef.current = player; urlRef.current = url;
        player.onended = () => { if (mountedRef.current && generation === requestGenerationRef.current) setPlaying(false); };
        void player.play().then(() => {
          if (!mountedRef.current || generation !== requestGenerationRef.current) { player.pause(); return; }
          setPlaying(true);
        }).catch(() => { if (mountedRef.current && generation === requestGenerationRef.current) setError("Audio could not start. Tap read again."); });
      },
      onError: () => { if (mountedRef.current && generation === requestGenerationRef.current) setError("The read-aloud service is unavailable right now."); },
    });
  };
  const stop = () => { requestGenerationRef.current += 1; cleanupAudio(); };
  if (!steps.length) return null;
  return <div data-testid="guided-cooking" className="fixed inset-0 z-50 flex min-h-[100dvh] flex-col bg-[#fff8ed] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] text-foreground">
    <header className="mx-auto flex w-full max-w-xl items-center justify-between"><button type="button" aria-label="Close guided cooking" title="Close guided cooking" data-testid="button-close-guided-cooking" onClick={() => { stop(); onClose(); }} className="min-h-11 min-w-11 rounded-xl border border-border bg-card"><X className="mx-auto h-5 w-5" /></button><p className="text-sm font-bold text-muted-foreground">Guided cooking</p><button type="button" aria-label="Stop read aloud" title="Stop read aloud" data-testid="button-stop-guided-audio" onClick={stop} className="min-h-11 min-w-11 rounded-xl border border-border bg-card text-muted-foreground"><Square className="mx-auto h-4 w-4" /></button></header>
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-6"><p className="mb-3 text-sm font-semibold text-primary">Step {current + 1} of {steps.length}</p><div className="mb-6 h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((current + 1) / steps.length) * 100}%` }} /></div><div data-testid={`text-guided-step-${current}`} className="min-h-[230px] rounded-3xl border border-primary/15 bg-card p-6 shadow-sm"><p className="mb-4 font-serif text-2xl font-semibold leading-tight">{step}</p>{read.isPending && <p data-testid="status-guided-loading" className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Preparing your step…</p>}{error && <p data-testid="status-guided-error" role="alert" className="text-sm text-destructive">{error}</p>}</div><div className="mt-5 grid grid-cols-3 gap-2"><button type="button" aria-label="Previous step" title="Previous step" data-testid="button-guided-previous" disabled={current === 0} onClick={() => selectStep(current - 1)} className="min-h-12 rounded-xl border border-border bg-card font-semibold disabled:opacity-40"><ChevronLeft className="mx-auto h-5 w-5" /></button><button type="button" aria-label={playing ? "Pause read aloud" : paused ? "Resume read aloud" : "Read this step aloud"} title={playing ? "Pause read aloud" : paused ? "Resume read aloud" : "Read this step aloud"} data-testid="button-guided-read" onClick={() => { if (playing && audioRef.current) { audioRef.current.pause(); setPaused(true); setPlaying(false); } else if (paused && audioRef.current) { void audioRef.current.play(); setPaused(false); setPlaying(true); } else requestAudio(); }} className="min-h-12 rounded-xl bg-primary font-bold text-primary-foreground">{playing ? <CirclePause className="mx-auto h-5 w-5" /> : paused ? <CirclePlay className="mx-auto h-5 w-5" /> : <><Headphones className="mr-1 inline h-4 w-4" />Read</>}</button><button type="button" aria-label="Next step" title="Next step" data-testid="button-guided-next" disabled={current === steps.length - 1} onClick={() => selectStep(current + 1)} className="min-h-12 rounded-xl border border-border bg-card font-semibold disabled:opacity-40"><ChevronRight className="mx-auto h-5 w-5" /></button></div></main>
    <details data-testid="guided-step-list" className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-card"><summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-semibold"><List className="h-4 w-4 text-primary" /> All steps</summary><div className="space-y-1 p-2">{steps.map((item, index) => <button type="button" data-testid={`button-guided-step-${index}`} key={index} onClick={() => selectStep(index)} className={`flex min-h-11 w-full items-start gap-3 rounded-xl p-2 text-left text-sm ${current === index ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><span className="font-bold">{index + 1}</span><span>{item}</span></button>)}</div></details>
  </div>;
}