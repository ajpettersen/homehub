import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';

import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { ActiveMemberProvider, useActiveMember } from '@/context/ActiveMemberContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { Shell } from '@/components/layout/Shell';
import { useHomeHubSignOut } from '@/hooks/useHomeHubSignOut';

import Onboarding from '@/pages/Onboarding';
import Dashboard from '@/pages/Dashboard';
import Chores from '@/pages/Chores';
import Kitchen from '@/pages/Kitchen';
import Tasks from '@/pages/Tasks';
import Workouts from '@/pages/Workouts';
import Settings from '@/pages/Settings';
import People from '@/pages/People';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/Landing';
import AccountSetup from '@/pages/AccountSetup';
import Invite from '@/pages/Invite';
import PersonalSetup from '@/pages/PersonalSetup';
import { Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

const clerkAppearance = {
  variables: {
    colorPrimary: '#d95d2b',
    colorForeground: '#332820',
    colorMutedForeground: '#74665c',
    colorBackground: '#fffdfa',
    colorInput: '#ffffff',
    colorInputForeground: '#332820',
    colorNeutral: '#ded5cc',
    fontFamily: 'Outfit, sans-serif',
    borderRadius: '0.875rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'w-[440px] max-w-full overflow-hidden rounded-2xl bg-white shadow-xl',
    card: '!rounded-none !border-0 !bg-transparent !shadow-none',
    footer: '!border-0 !bg-transparent !shadow-none',
    headerTitle: 'font-serif text-foreground',
    headerSubtitle: 'text-muted-foreground',
    formFieldLabel: 'text-foreground',
    formButtonPrimary: 'bg-primary hover:bg-primary/90',
    formFieldInput: 'border-border text-foreground',
    footerActionLink: 'text-primary',
    footerActionText: 'text-muted-foreground',
  },
};

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function SignInRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/sign-in', { replace: true });
  }, [setLocation]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">Opening sign in…</p>
    </div>
  );
}

function isDevelopmentPreviewMode(): boolean {
  return import.meta.env.DEV;
}

function ProfileInitializer() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void fetch('/api/me', { credentials: 'include' });
  }, [isLoaded, isSignedIn]);

  return null;
}

function AuthScopedStateReset() {
  const { isLoaded, userId } = useAuth();
  const queryClient = useQueryClient();
  const { setActiveMember } = useActiveMember();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      setActiveMember(null);
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [isLoaded, queryClient, setActiveMember, userId]);
  return null;
}

/**
 * Shows the first-login setup wizard to approved household owners whose
 * household has not completed onboarding yet. Everyone else (pending users,
 * cleaners, already-onboarded households) sees the normal app.
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  // Intentionally not gated on Clerk's client-side isSignedIn: the API
  // authenticates via the session cookie, so a successful /api/me response is
  // the authoritative signal that the user is signed in. (Clerk's client
  // state can lag or fail to hydrate while cookie auth still works, which
  // previously let un-onboarded households slip past this gate.)
  const signOut = useHomeHubSignOut();
  const { data: me, isLoading, isError, refetch } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <p className="font-bold text-foreground">We couldn’t load your account.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try again, or sign out and return later.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => void refetch()} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Try again</button>
            <button type="button" onClick={() => void signOut()} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading your account…</p>
      </div>
    );
  }

  if (me.role === 'pending') {
    return <AccountSetup />;
  }

  if (me?.role === 'family' && me.isAdmin && !me.onboardingCompleted) {
    return <Onboarding />;
  }
  
  if (me.needsPersonalSetup) {
    return <PersonalSetup />;
  }

  return <>{children}</>;
}

function SetupRerun() {
  const [, navigate] = useLocation();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading household setup…</p>
      </div>
    );
  }

  if (me.role !== "family" || !me.isAdmin) {
    return <Redirect to="/settings" />;
  }

  return (
    <Onboarding
      rerun
      onCancel={() => navigate("/settings")}
      onComplete={() => navigate("/settings")}
    />
  );
}
function AuthenticatedApp() {
  const { isLoaded, isSignedIn } = useAuth();
  const previewMode = isDevelopmentPreviewMode();

  if (!isLoaded && !previewMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading HomeHub…</p>
      </div>
    );
  }

  if (!isSignedIn && !previewMode) {
    return <SignInRedirect />;
  }

  if (previewMode) {
    return (
      <Shell>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/chores" component={Chores} />
          <Route path="/meals" component={Kitchen} />
          <Route path="/tasks" component={Tasks} />
          <Route path="/workouts" component={Workouts} />
          <Route path="/properties">
            <Redirect to="/tasks?view=maintenance&preview=1" />
          </Route>
          <Route path="/settings" component={Settings} />
          <Route path="/people" component={People} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    );
  }

  return (
    <OnboardingGate>
      <Shell>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/chores" component={Chores} />
          <Route path="/meals" component={Kitchen} />
          <Route path="/tasks" component={Tasks} />
          <Route path="/workouts" component={Workouts} />
          <Route path="/properties">
            <Redirect to="/tasks?view=maintenance" />
          </Route>
          <Route path="/settings" component={Settings} />
          <Route path="/setup" component={SetupRerun} />
          <Route path="/people" component={People} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </OnboardingGate>
  );
}

function RootPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const previewMode = isDevelopmentPreviewMode();

  if (!isLoaded && !previewMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading HomeHub…</p>
      </div>
    );
  }

  return isSignedIn || previewMode ? <AuthenticatedApp /> : <Landing />;
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/invite" component={Invite} />
      <Route path="/" component={RootPage} />
      <Route component={AuthenticatedApp} />
    </Switch>
  );
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={to => setLocation(stripBase(to))}
      routerReplace={to => setLocation(stripBase(to), { replace: true })}
    >
      <ProfileInitializer />
      <QueryClientProvider client={queryClient}>
        <ActiveMemberProvider>
          <AuthScopedStateReset />
          <PreferencesProvider>
            <Router />
          </PreferencesProvider>
        </ActiveMemberProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkApp />
    </WouterRouter>
  );
}

export default App;
