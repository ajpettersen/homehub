import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Utensils, AlertTriangle, CheckSquare } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });

  if (isLoading) {
    return <div className="p-8 animate-pulse flex flex-col gap-6">
      <div className="h-12 bg-muted rounded-xl w-1/3"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-2xl"></div>)}
      </div>
    </div>
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-serif font-bold text-foreground mb-2">Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, Family!</h1>
        <p className="text-muted-foreground text-lg">Here's what's happening around the house today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-primary/10 border-primary/20 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10">
            <CheckCircle2 className="w-32 h-32" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-primary text-sm uppercase tracking-wider font-sans">Chores Due Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-serif font-bold text-primary">{dashboard.choresToday}</div>
            {dashboard.choresOverdue > 0 && (
              <p className="text-sm font-medium text-destructive mt-2 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> {dashboard.choresOverdue} overdue
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-secondary/10 border-secondary/20 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10">
            <Utensils className="w-32 h-32" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-secondary text-sm uppercase tracking-wider font-sans">Today's Meals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-serif font-bold text-secondary">{dashboard.todaysMeals.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-accent/20 border-accent/30 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10 text-accent-foreground">
            <CheckSquare className="w-32 h-32" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-accent-foreground text-sm uppercase tracking-wider font-sans">Active Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-serif font-bold text-accent-foreground">{dashboard.activeTodoItems}</div>
          </CardContent>
        </Card>

        <Card className="bg-orange-100 border-orange-200 dark:bg-orange-950 dark:border-orange-900 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10 text-orange-600">
            <Clock className="w-32 h-32" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-orange-700 dark:text-orange-400 text-sm uppercase tracking-wider font-sans">Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-serif font-bold text-orange-700 dark:text-orange-400">{dashboard.maintenanceDueSoon}</div>
            {dashboard.maintenanceOverdue > 0 && (
              <p className="text-sm font-medium text-destructive mt-2 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> {dashboard.maintenanceOverdue} overdue
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2 inline-block">On the Menu</h2>
          {dashboard.todaysMeals.length === 0 ? (
            <div className="p-6 border-2 border-dashed border-border rounded-2xl text-center">
              <p className="text-muted-foreground">Nothing planned for today yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dashboard.todaysMeals.map(meal => (
                <Card key={meal.id} className="border-l-4 border-l-secondary">
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <Badge variant="outline" className="mb-2 bg-secondary/10 text-secondary border-secondary/20">{meal.mealType}</Badge>
                      <h3 className="font-semibold text-lg">{meal.meal}</h3>
                      {meal.notes && <p className="text-sm text-muted-foreground mt-1">{meal.notes}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2 inline-block">Upcoming Maintenance</h2>
          {dashboard.upcomingMaintenance.length === 0 ? (
            <div className="p-6 border-2 border-dashed border-border rounded-2xl text-center">
              <p className="text-muted-foreground">House is in top shape!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dashboard.upcomingMaintenance.map(task => (
                <Card key={task.id} className={`border-l-4 ${task.isOverdue ? 'border-l-destructive' : 'border-l-orange-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg leading-tight">{task.title}</h3>
                      {task.isOverdue && <Badge variant="destructive" className="ml-2 whitespace-nowrap text-[10px]">Overdue</Badge>}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Due: {format(new Date(task.nextDueDate), 'MMM d')}</span>
                      <span className="flex items-center gap-1 text-primary">{task.propertyName}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
