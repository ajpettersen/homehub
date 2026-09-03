import { useState } from "react";
import { useClerk } from "@clerk/react";
import {
  getGetMeQueryKey,
  useGetMe,
  useRequestHouseholdJoin,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, LogOut, RefreshCw, Users } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AccountSetup() {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { data: me, refetch, isFetching } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      refetchOnWindowFocus: true,
      refetchInterval: 15_000,
    },
  });
  const requestJoin = useRequestHouseholdJoin();
  const [choice, setChoice] = useState<"join" | "not-joining" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await requestJoin.mutateAsync({ data: { administratorEmail: email.trim() } });
      setSubmitted(true);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch {
      setError("Unable to submit this join request. Check the administrator email and try again.");
    }
  };

  const signOutNow = () => signOut({ redirectUrl: basePath || "/" });

  if (submitted) {
    return (
      <SetupFrame>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-5 font-serif text-3xl font-bold text-foreground">Request sent</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          If this is an eligible household administrator, they can review your request. HomeHub will remain locked unless they approve it.
        </p>
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Checking…" : "Check approval status"}
          </button>
          <button
            type="button"
            onClick={() => void signOutNow()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </SetupFrame>
    );
  }

  return (
    <SetupFrame>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Users className="h-7 w-7" />
      </div>
      <h1 className="mt-5 font-serif text-3xl font-bold text-foreground">Set up your account</h1>
      {!choice && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Are you joining a family that already uses HomeHub?
          </p>
          <div className="mt-6 grid gap-3">
            <button type="button" onClick={() => setChoice("join")} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">
              Yes, join my family
            </button>
            <button type="button" onClick={() => setChoice("not-joining")} className="rounded-xl border border-border px-4 py-3 text-sm font-bold text-foreground hover:bg-muted">
              No, I’m not joining one
            </button>
          </div>
        </>
      )}

      {choice === "join" && (
        <form onSubmit={submit} className="mt-5 text-left">
          <button type="button" onClick={() => { setChoice(null); setError(null); }} className="mb-4 flex items-center gap-1 text-xs font-bold text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <label htmlFor="administrator-email" className="text-sm font-bold text-foreground">Family administrator email</label>
          <input
            id="administrator-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="administrator@example.com"
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
          />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            We’ll send your request to that administrator’s household. They must approve your account before you can access family information.
          </p>
          {error && <p className="mt-3 text-sm font-medium text-destructive">{error}</p>}
          <button type="submit" disabled={requestJoin.isPending} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {requestJoin.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {requestJoin.isPending ? "Submitting…" : "Request to join"}
          </button>
        </form>
      )}

      {choice === "not-joining" && (
        <div className="mt-5">
          <p className="rounded-xl bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
            HomeHub accounts need approval from an existing family administrator. If you were invited, go back and enter that person’s email.
          </p>
          <button type="button" onClick={() => setChoice(null)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold">
            <ArrowLeft className="h-4 w-4" /> Go back
          </button>
        </div>
      )}

      <button type="button" onClick={() => void signOutNow()} className="mt-6 text-xs font-bold text-muted-foreground hover:text-foreground">
        Sign out
      </button>
    </SetupFrame>
  );
}

function SetupFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-xl">
        {children}
      </section>
    </main>
  );
}