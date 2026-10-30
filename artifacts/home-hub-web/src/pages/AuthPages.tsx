import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { postAuth, redirectTarget, useAuth } from '@/context/AuthContext';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const SETUP_TOKEN_KEY = 'homehub_password_setup_token';

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Heart className="h-4 w-4 fill-current" />
          </div>
          <span className="font-serif text-2xl font-bold tracking-tight text-foreground">HomeHub</span>
        </div>
        <h1 className="text-center font-serif text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-destructive">{message}</p>;
}

/** Keeps ?redirect_url= when switching between sign-in and sign-up. */
function withRedirect(path: string): string {
  const redirect = new URLSearchParams(window.location.search).get('redirect_url');
  return redirect ? `${path}?redirect_url=${encodeURIComponent(redirect)}` : path;
}

function useFinishSignIn() {
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  return async (target = redirectTarget(basePath)) => {
    queryClient.clear();
    await refresh();
    setLocation(target, { replace: true });
  };
}

function useRedirectIfSignedIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (isLoaded && isSignedIn) setLocation(redirectTarget(basePath), { replace: true });
  }, [isLoaded, isSignedIn, setLocation]);
}

export function SignInPage() {
  useRedirectIfSignedIn();
  const finish = useFinishSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await postAuth('sign-in', { email, password });
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your household.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sign-in-email">Email</Label>
          <Input id="sign-in-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sign-in-password">Password</Label>
          <Input id="sign-in-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <ErrorText message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Forgot your password? Ask a household admin for a new password link.
      </p>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        New here? <Link href={withRedirect('/sign-up')} className="font-semibold text-primary">Create an account</Link>
      </p>
    </AuthCard>
  );
}

export function SignUpPage() {
  useRedirectIfSignedIn();
  const finish = useFinishSignIn();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await postAuth('sign-up', { name, email, password });
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Create your account" subtitle="A family member will let you into the household.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sign-up-name">Your name</Label>
          <Input id="sign-up-name" autoComplete="name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sign-up-email">Email</Label>
          <Input id="sign-up-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sign-up-password">Password</Label>
          <Input id="sign-up-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <ErrorText message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link href={withRedirect('/sign-in')} className="font-semibold text-primary">Sign in</Link>
      </p>
    </AuthCard>
  );
}

/** /set-password#<token> — the page a password link opens. */
export function SetPasswordPage() {
  const finish = useFinishSignIn();
  const [token] = useState(() => {
    const fromHash = window.location.hash.slice(1);
    if (fromHash) {
      try { sessionStorage.setItem(SETUP_TOKEN_KEY, fromHash); } catch { /* storage unavailable */ }
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return fromHash;
    }
    try { return sessionStorage.getItem(SETUP_TOKEN_KEY) ?? ''; } catch { return ''; }
  });
  const [linkEmail, setLinkEmail] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>(token ? 'checking' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (!token || checked.current) return;
    checked.current = true;
    postAuth<{ valid: boolean; email?: string }>('password-setup/validate', { token })
      .then(result => {
        setLinkState(result.valid ? 'valid' : 'invalid');
        setLinkEmail(result.email ?? null);
      })
      .catch(() => setLinkState('invalid'));
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await postAuth('password-setup/complete', { token, password });
      try { sessionStorage.removeItem(SETUP_TOKEN_KEY); } catch { /* storage unavailable */ }
      await finish('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set your password.');
      setBusy(false);
    }
  };

  if (linkState === 'checking') {
    return (
      <AuthCard title="Set your password">
        <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary/60" /></div>
      </AuthCard>
    );
  }

  if (linkState === 'invalid') {
    return (
      <AuthCard title="This link doesn't work" subtitle="It may have expired or already been used. Ask a household admin for a new one.">
        <Link href="/sign-in" className="block text-center text-sm font-semibold text-primary">Go to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set your password" subtitle={linkEmail ? `For ${linkEmail}. You'll sign in with this email from now on.` : undefined}>
      <form onSubmit={submit} className="space-y-4">
        {linkEmail && <input type="email" autoComplete="username" value={linkEmail} readOnly hidden />}
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Type it again</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        <ErrorText message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save password and sign in
        </Button>
      </form>
    </AuthCard>
  );
}
