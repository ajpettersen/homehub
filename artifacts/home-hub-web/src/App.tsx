import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { ActiveMemberProvider } from '@/context/ActiveMemberContext';
import { Shell } from '@/components/layout/Shell';

import Dashboard from '@/pages/Dashboard';
import Chores from '@/pages/Chores';
import Kitchen from '@/pages/Kitchen';
import Tasks from '@/pages/Tasks';
import Maintenance from '@/pages/Maintenance';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/chores" component={Chores} />
        <Route path="/kitchen" component={Kitchen} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/maintenance" component={Maintenance} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ActiveMemberProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
      </ActiveMemberProvider>
    </QueryClientProvider>
  );
}

export default App;
