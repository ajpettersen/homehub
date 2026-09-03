import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { ActiveMemberProvider } from '@/context/ActiveMemberContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { Shell } from '@/components/layout/Shell';

import Onboarding from '@/pages/Onboarding';
import Dashboard from '@/pages/Dashboard';
import Chores from '@/pages/Chores';
import Kitchen from '@/pages/Kitchen';
import Tasks from '@/pages/Tasks';
import Workouts from '@/pages/Workouts';
import Maintenance from '@/pages/Maintenance';
import Settings from '@/pages/Settings';
import People from '@/pages/People';
import NotFound from '@/pages/not-found';

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

function ProfileInitializer() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void fetch('/api/me', { credentials: 'include' });
  }, [isLoaded, isSignedIn]);

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
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  if (me?.role === 'family' && !me.onboardingCompleted) {
    return <Onboarding />;
  }
  return <>{children}</>;
}

function AuthenticatedApp() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading HomeHub…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return <SignInRedirect />;
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
          <Route path="/properties" component={Maintenance} />
          <Route path="/settings" component={Settings} />
          <Route path="/people" component={People} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </OnboardingGate>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
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
