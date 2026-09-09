import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useCompletePersonalSetup,
  useGetMyFamilyProfile,
  getGetMyFamilyProfileQueryKey,
  getGetMeQueryKey,
  getGetFamilyMembersQueryKey,
  PersonalSetupInputColor,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { COLORS, ColorPicker } from "./Settings";

export default function PersonalSetup() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const completeSetup = useCompletePersonalSetup();
  
  const { data: myProfile, isLoading: isProfileLoading } = useGetMyFamilyProfile({
    query: {
      queryKey: getGetMyFamilyProfileQueryKey(),
    }
  });

  const [name, setName] = useState(myProfile?.name ?? "");
  const [color, setColor] = useState(myProfile?.color ?? COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  // Re-sync if profile loads late
  const initialized = useRef(false);
  useEffect(() => {
    if (myProfile && !initialized.current) {
      setName(myProfile.name || "");
      setColor(myProfile.color || COLORS[0]);
      initialized.current = true;
    }
  }, [myProfile]);

  const handleComplete = async () => {
    // Invalidate everything so we enter the app fresh
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetMyFamilyProfileQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() }),
    ]);
    setLocation("/", { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setError(null);
    try {
      await completeSetup.mutateAsync({
        data: {
          name: name.trim(),
          color: color as PersonalSetupInputColor,
        }
      });
      await handleComplete();
    } catch (err) {
      setError((err as any)?.data?.error || (err instanceof Error ? err.message : "Failed to complete setup."));
    }
  };

  const handleSkip = async () => {
    setError(null);
    try {
      // Send an empty body to safely skip/continue
      await completeSetup.mutateAsync({
        data: {}
      });
      await handleComplete();
    } catch (err) {
      setError((err as any)?.data?.error || (err instanceof Error ? err.message : "Failed to continue."));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 mx-auto">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-center font-serif text-3xl font-bold text-foreground">Welcome to HomeHub</h1>
        <p className="text-center text-sm text-muted-foreground mt-2 mb-8">
          You've successfully joined the household! Let's set up your personal profile before you enter.
        </p>
        
        {isProfileLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 text-left">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                Your Name
              </label>
              <input
                autoFocus
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="How you are known in the household"
                className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                Your Color
              </label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive font-medium">{error}</p>
            )}

            <div className="mt-8 flex flex-col gap-3">
              <button
                type="submit"
                disabled={completeSetup.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {completeSetup.isPending ? "Saving..." : "Continue to HomeHub"}
                {!completeSetup.isPending && <ArrowRight className="w-4 h-4" />}
              </button>
              
              <button
                type="button"
                onClick={handleSkip}
                disabled={completeSetup.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3.5 text-sm font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
