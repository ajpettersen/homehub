import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import {
  useValidateHouseholdInvite,
  useRedeemHouseholdInvite,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, UserCircle, Home } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Invite() {
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  
  // Extract token synchronously on mount
  const [token] = useState<string>(() => {
    const hashToken = window.location.hash.slice(1);
    if (hashToken) {
      sessionStorage.setItem("homehub_invite_token", hashToken);
      history.replaceState(null, "", window.location.pathname + window.location.search);
      return hashToken;
    }
    return sessionStorage.getItem("homehub_invite_token") || "";
  });

  const [validationResult, setValidationResult] = useState<{valid?: boolean, error?: string} | null>(
    token ? null : { valid: false, error: "Invite link is missing or expired." }
  );

  const queryClient = useQueryClient();

  const validateInvite = useValidateHouseholdInvite();
  const redeemInvite = useRedeemHouseholdInvite();
  const validationStarted = useRef(false);

  // Validate when we have a token
  useEffect(() => {
    if (!token) return;
    if (validationResult !== null) return; // already validated or currently validating
    if (validationStarted.current) return;
    validationStarted.current = true;

    validateInvite.mutate({ data: { token } }, {
      onSuccess: (res) => {
        setValidationResult({ valid: res.valid });
        if (!res.valid) {
          sessionStorage.removeItem("homehub_invite_token");
        }
      },
      onError: () => {
        setValidationResult({ valid: false, error: "Could not validate the invite link." });
        sessionStorage.removeItem("homehub_invite_token");
      }
    });
  }, [token, validationResult]);

  // Try to redeem if they are signed in and validation passed
  const handleRedeem = () => {
    if (!token) return;
    redeemInvite.mutate({ data: { token } }, {
      onSuccess: async () => {
        sessionStorage.removeItem("homehub_invite_token");
        // Clear caches so the app knows we are in a household now
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/", { replace: true });
      },
      onError: (err) => {
        alert(err instanceof Error ? err.message : "Failed to join household.");
      }
    });
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    );
  }

  // Otherwise, we are in the validating or join screen
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl p-6 sm:p-8">
        
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 mx-auto">
          <Home className="w-6 h-6 text-primary" />
        </div>
        
        {validateInvite.isPending || (token && !validationResult) ? (
          <div className="text-center space-y-4 py-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary/50 mx-auto" />
            <p className="text-sm font-medium text-foreground">Validating invite...</p>
          </div>
        ) : validationResult && !validationResult.valid ? (
          <div className="text-center space-y-4">
            <h1 className="font-serif text-2xl font-bold text-foreground">Invite Unavailable</h1>
            <p className="text-sm text-muted-foreground">
              {validationResult.error || "This invite link is invalid or has expired."}
            </p>
            <button 
              onClick={() => setLocation("/")}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go to HomeHub
            </button>
          </div>
        ) : validationResult?.valid ? (
          <div className="text-center">
            <h1 className="font-serif text-3xl font-bold text-foreground tracking-tight">You've been invited!</h1>
            <p className="text-sm text-muted-foreground mt-2 mb-8">
              Join your family's household on HomeHub.
            </p>

            {!isSignedIn ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-foreground bg-muted/50 p-4 rounded-xl border border-border/50">
                  Create an account or sign in to accept this invitation.
                </p>
                <button
                  onClick={() => {
                    const returnUrl = encodeURIComponent(`${basePath}/invite`);
                    setLocation(`/sign-up?redirect_url=${returnUrl}`);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                >
                  <UserCircle className="w-4 h-4" />
                  Sign up to join
                </button>
                <button
                  onClick={() => {
                    const returnUrl = encodeURIComponent(`${basePath}/invite`);
                    setLocation(`/sign-in?redirect_url=${returnUrl}`);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3.5 text-sm font-bold text-foreground hover:bg-muted transition-colors"
                >
                  Sign in
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 text-left">
                  <p className="text-sm font-bold text-foreground mb-1">Ready to join?</p>
                  <p className="text-xs text-muted-foreground">You are signed in. Click below to accept the invitation and link your account.</p>
                </div>
                
                <button
                  onClick={handleRedeem}
                  disabled={redeemInvite.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {redeemInvite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {redeemInvite.isPending ? "Joining..." : "Join Household"}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
