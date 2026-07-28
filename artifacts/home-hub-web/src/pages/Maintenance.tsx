import { useState } from "react";
import { 
  useGetMaintenanceTasks, getGetMaintenanceTasksQueryKey, 
  useCompleteMaintenanceTask,
  useCreateMaintenanceTask,
  useDeleteMaintenanceTask,
  useGetProperties, getGetPropertiesQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { CheckCircle2, Clock, Wrench, Calendar, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export default function Maintenance() {
  const queryClient = useQueryClient();
  const { activeMember } = useActiveMember();
  
  const { data: tasks, isLoading } = useGetMaintenanceTasks({}, { query: { queryKey: getGetMaintenanceTasksQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  
  const completeTask = useCompleteMaintenanceTask();
  const createTask = useCreateMaintenanceTask();
  const deleteTask = useDeleteMaintenanceTask();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPropertyId, setNewPropertyId] = useState("");
  const [newCategory, setNewCategory] = useState<"filter" | "water" | "seasonal" | "appliance" | "yard" | "other" | "cleaning">("other");
  const [newFreq, setNewFreq] = useState("30");
  const [newStartDate, setNewStartDate] = useState("");

  const handleComplete = (id: string) => {
    if (!activeMember) {
      alert("Please select who you are in the sidebar first!");
      return;
    }
    completeTask.mutate(
      { id, data: { completedBy: activeMember.name } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() }) }
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this maintenance task entirely?")) return;
    deleteTask.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() }) });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newPropertyId) return;
    const today = new Date().toISOString().split("T")[0];
    createTask.mutate(
      { data: { 
        title: newTitle, 
        propertyId: newPropertyId, 
        category: newCategory, 
        frequencyDays: parseInt(newFreq) || 30,
        startDate: newStartDate || null,
        nextDueDate: newStartDate || today,
      } },
      { onSuccess: () => {
        setIsCreateOpen(false);
        setNewTitle("");
        setNewStartDate("");
        queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });
      }}
    );
  };

  if (isLoading) return <div className="p-8 font-serif text-xl text-muted-foreground animate-pulse">Loading maintenance tasks...</div>;

  const dueTasks = tasks?.filter(t => t.isDueSoon || t.isOverdue) || [];
  const upcomingTasks = tasks?.filter(t => !t.isDueSoon && !t.isOverdue) || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold flex items-center gap-3">
            <Wrench className="w-8 h-8 text-orange-600" /> Maintenance
          </h1>
          <p className="text-muted-foreground mt-2">Keep the properties in top shape.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-md bg-orange-600 hover:bg-orange-700 text-white"><Plus className="w-4 h-4"/> Add Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Maintenance Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Title</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Property</label>
                <select 
                  value={newPropertyId} 
                  onChange={e => setNewPropertyId(e.target.value)} 
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  required
                >
                  <option value="">Select a property</option>
                  {properties?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Category</label>
                  <select 
                    value={newCategory} 
                    onChange={e => setNewCategory(e.target.value as any)} 
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="filter">Filter</option>
                    <option value="water">Water</option>
                    <option value="seasonal">Seasonal</option>
                    <option value="appliance">Appliance</option>
                    <option value="yard">Yard</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Repeat every (Days)</label>
                  <Input type="number" min="1" value={newFreq} onChange={e => setNewFreq(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  First occurrence
                  <span className="ml-1 font-normal text-muted-foreground">(optional — anchors the repeating schedule)</span>
                </label>
                <Input
                  type="date"
                  value={newStartDate}
                  onChange={e => setNewStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
                {newStartDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Task will repeat every {newFreq || 30} days, always anchored to this date — not the completion date.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="submit" disabled={createTask.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                  {createTask.isPending ? 'Saving...' : 'Add Task'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {dueTasks.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-serif font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2 border-b-2 border-orange-200 pb-2">
            <AlertTriangle className="w-5 h-5" /> Requires Attention
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dueTasks.map(task => (
              <TaskCard key={task.id} task={task} onComplete={handleComplete} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4 pt-4">
        <h2 className="text-2xl font-serif font-semibold border-b-2 border-border pb-2">Upcoming</h2>
        {upcomingTasks.length === 0 ? (
          <p className="text-muted-foreground italic">No upcoming tasks.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingTasks.map(task => (
              <TaskCard key={task.id} task={task} onComplete={handleComplete} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onComplete, onDelete }: { task: any, onComplete: (id: string) => void, onDelete: (id: string) => void }) {
  const isUrgent = task.isOverdue;
  const isSoon = task.isDueSoon && !task.isOverdue;

  return (
    <Card className={`group relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
      isUrgent ? 'border-destructive/50 bg-destructive/5' : 
      isSoon ? 'border-orange-500/50 bg-orange-500/5' : 'bg-card'
    }`}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${
            isUrgent ? 'border-destructive text-destructive' :
            isSoon ? 'border-orange-500 text-orange-600' : 'text-muted-foreground'
          }`}>
            {task.category}
          </Badge>
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium px-2 py-1 bg-muted rounded-md text-foreground flex items-center gap-1">
              {task.propertyName}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity" onClick={() => onDelete(task.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        
        <h3 className="font-serif text-xl font-bold mb-2 leading-tight">{task.title}</h3>
        {task.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{task.description}</p>
        )}
        
        <div className="space-y-2 mb-6">
          <div className="text-sm flex items-center gap-2">
            <Clock className={`w-4 h-4 ${isUrgent ? 'text-destructive' : 'text-muted-foreground'}`} /> 
            <span className={isUrgent ? "text-destructive font-semibold" : "text-muted-foreground"}>
              Due {format(new Date(task.nextDueDate + "T00:00:00"), 'MMM d, yyyy')}
            </span>
          </div>
          {task.startDate && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Calendar className="w-3 h-3 text-orange-500" />
              <span>Anchored to {format(new Date(task.startDate + "T00:00:00"), 'MMM d')} · every {task.frequencyDays}d</span>
            </div>
          )}
          {task.lastCompletedAt && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              Last done {format(new Date(task.lastCompletedAt), 'MMM d')} {task.lastCompletedBy ? `by ${task.lastCompletedBy}` : ''}
            </div>
          )}
        </div>

        <Button 
          onClick={() => onComplete(task.id)}
          className={`w-full gap-2 transition-colors ${!isUrgent && !isSoon ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/50 dark:text-orange-300' : ''}`}
          variant={isUrgent ? "destructive" : isSoon ? "default" : "secondary"}
        >
          <CheckCircle2 className="w-4 h-4" /> Mark Complete
        </Button>
      </CardContent>
    </Card>
  );
}
