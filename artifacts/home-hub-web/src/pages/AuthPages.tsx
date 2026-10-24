import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Home, Loader2 } from "lucide-react";
import { authRequest, safeRedirectTarget, useAuth } from "@/auth/AuthContext";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const MIN_PASSWORD_LENGTH = 10;

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Home className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-center font-serif text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-2 text-center text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label, type = "text", value, onChange, autoComplete, autoFocus, hint,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onChange={event => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-[16px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function ErrorText({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p> : null;
}

function useFinishAuth() {
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  return async () => {
    queryClient.clear();
    await refresh();
    const redirect = new URLSearchParams(search).get("redirect_url");
    setLocation(safeRedirectTarget(redirect, basePath), { replace: true });
  };
}

function useRedirectQuery(): string {
  const search = useSearch();
  const redirect = new URLSearchParams(search).get("redirect_url");
  return redirect ? `?redirect_url=${encodeURIComponent(redirect)}` : "";
}

export function SignInPage() {
  const finish = useFinishAuth();
  const redirectQuery = useRedirectQuery();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authRequest("sign-in", { email, password });
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" subtitle="Welcome back to HomeHub.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        <ErrorText message={error} />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href={`/sign-up${redirectQuery}`} className="font-semibold text-primary">Create your login</Link>
      </p>
    </AuthCard>
  );
}

type Account = { id: string; name: string; role: string };

export function SignUpPage() {
  const finish = useFinishAuth();
  const redirectQuery = useRedirectQuery();
  const inviteToken = (() => {
    try {
      return sessionStorage.getItem("homehub_invite_token") || "";
    } catch {
      return "";
    }
  })();

  // Without an invite, a login can only be created with the household setup code.
  const [setupCode, setSetupCode] = useState("");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [claimAccountId, setClaimAccountId] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSetupCode = !inviteToken && accounts === null;

  const checkCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await authRequest<{ accounts: Account[] }>("setup/accounts", { setupCode });
      setAccounts(data.accounts);
      setClaimAccountId(data.accounts[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That setup code isn't right.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authRequest("sign-up", {
        email,
        password,
        firstName,
        lastName,
        ...(inviteToken ? { inviteToken } : { setupCode, claimAccountId: claimAccountId || undefined }),
      });
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your login.");
      setBusy(false);
    }
  };

  if (needsSetupCode) {
    return (
      <AuthCard title="Create your login" subtitle="Enter the household setup code to get started.">
        <form onSubmit={checkCode} className="space-y-4">
          <Field label="Setup code" type="password" value={setupCode} onChange={setSetupCode} autoComplete="off" autoFocus />
          <ErrorText message={error} />
          <SubmitButton busy={busy}>Continue</SubmitButton>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have a login?{" "}
          <Link href={`/sign-in${redirectQuery}`} className="font-semibold text-primary">Sign in</Link>
        </p>
      </AuthCard>
    );
  }

  const claiming = !!claimAccountId;
  return (
    <AuthCard
      title="Create your login"
      subtitle={inviteToken ? "Set up your login to join the household." : "Pick your existing account, then choose your email and password."}
    >
      <form onSubmit={submit} className="space-y-4">
        {accounts && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">Who are you?</legend>
            {accounts.map(account => (
              <label key={account.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="account" checked={claimAccountId === account.id} onChange={() => setClaimAccountId(account.id)} />
                <span className="text-sm text-foreground">
                  {account.name}
                  {account.role === "cleaner" && <span className="text-muted-foreground"> (cleaner)</span>}
                </span>
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="account" checked={claimAccountId === ""} onChange={() => setClaimAccountId("")} />
              <span className="text-sm text-foreground">Someone new</span>
            </label>
          </fieldset>
        )}
        {!claiming && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
            <Field label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" />
          </div>
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        <ErrorText message={error} />
        <SubmitButton busy={busy}>Create login</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have a login?{" "}
        <Link href={`/sign-in${redirectQuery}`} className="font-semibold text-primary">Sign in</Link>
      </p>
    </AuthCard>
  );
}
