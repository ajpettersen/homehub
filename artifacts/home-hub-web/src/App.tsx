import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { ActiveMemberProvider } from '@/context/ActiveMemberContext';
import { Shell } from '@/components/layout/Shell';

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

function Router() {
  return (
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
