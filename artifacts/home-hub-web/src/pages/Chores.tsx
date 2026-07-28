import { useState } from "react";
import { 
  useGetChores, getGetChoresQueryKey, 
  useCompleteChore, 
  useCreateChore,
  useDeleteChore,
  useGetProperties, getGetPropertiesQueryKey,
  useGetFamilyMembers, getGetFamilyMembersQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useActiveMember } from "@/context/ActiveMemberContext";
import { CheckCircle2, Clock, Plus, Brush, Star, Trash2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export default function Chores() {
  const queryClient = useQueryClient();
  const { activeMember } = useActiveMember();
  
  const { data: chores, isLoading } = useGetChores({}, { query: { queryKey: getGetChoresQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  
  const completeChore = useCompleteChore();
  const createChore = useCreateChore();
  const deleteChore = useDeleteChore();

  const [isSnoozing, setIsSnoozing] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPropertyId, setNewPropertyId] = useState("");
  const [newFreq, setNewFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [newPoints, setNewPoints] = useState("10");

  const overdueChores = chores?.filter(c => !c.completedAt && c.isOverdue) || [];

  const handleSnoozeOverdue = async () => {
    setIsSnoozing(true);
    try {
      await fetch("/api/chores/snooze-overdue", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
    } finally {
      setIsSnoozing(false);
    }
  };

  const handleComplete = (id: string) => {
    if (!activeMember) {
      alert("Please select who you are in the sidebar first!");
      return;
    }
    completeChore.mutate(
      { id, data: { completedBy: activeMember.name } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() }) }
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this chore entirely?')) return;
    deleteChore.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() }) }
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newPropertyId) return;
    createChore.mutate(
      { data: { 
        title: newTitle, 
        propertyId: newPropertyId, 
        frequency: newFreq, 
        points: parseInt(newPoints) || 0 
      } },
      { onSuccess: () => {
        setIsCreateOpen(false);
        setNewTitle("");
        queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
      }}
    );
  };

  if (isLoading) return <div className="p-8 animate-pulse text-xl font-serif text-muted-foreground">Loading chores...</div>;

  const incompleteChores = chores?.filter(c => !c.completedAt) || [];
  const completedChores = chores?.filter(c => c.completedAt) || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold flex items-center gap-3">
            <Brush className="w-8 h-8 text-primary" /> Chores
          </h1>
          <p className="text-muted-foreground mt-2">Earn points, keep the house running.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-md"><Plus className="w-4 h-4"/> Add Chore</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a New Chore</DialogTitle>
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
                  <label className="text-sm font-medium mb-1 block">Frequency</label>
                  <select 
                    value={newFreq} 
                    onChange={e => setNewFreq(e.target.value as any)} 
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Points</label>
                  <Input type="number" value={newPoints} onChange={e => setNewPoints(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="submit" disabled={createChore.isPending}>
                  {createChore.isPending ? 'Saving...' : 'Add Chore'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {overdueChores.length > 0 && (
        <div className="flex items-center justify-between gap-4 bg-destructive/10 border border-destructive/30 rounded-2xl px-5 py-4">
          <div>
            <p className="font-semibold text-destructive">
              {overdueChores.length} overdue {overdueChores.length === 1 ? "chore" : "chores"} from previous days
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Reschedule them to today or later so the list stays current.
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground gap-2"
            onClick={handleSnoozeOverdue}
            disabled={isSnoozing}
          >
            <RefreshCw className={`w-4 h-4 ${isSnoozing ? "animate-spin" : ""}`} />
            {isSnoozing ? "Rescheduling…" : "Reschedule All"}
          </Button>
        </div>
      )}

      <div className="space-y-6">
        <h2 className="text-2xl font-serif font-semibold border-b-2 border-primary/20 pb-2">To Do</h2>
        {incompleteChores.length === 0 ? (
          <div className="p-12 border-2 border-dashed border-border rounded-3xl text-center bg-card">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Star className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-serif font-semibold mb-2">All caught up!</h3>
            <p className="text-muted-foreground">Go relax, the house is clean.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {incompleteChores.map(chore => (
              <Card key={chore.id} className={`group relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${chore.isOverdue ? 'border-destructive/50 bg-destructive/5' : 'bg-card'}`}>
                <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-bl from-background to-transparent opacity-50 rounded-bl-xl z-10 pointer-events-none"></div>
                
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <Badge variant={chore.isOverdue ? "destructive" : "outline"} className="text-xs">
                      {chore.frequency}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <div className="text-primary font-bold flex items-center gap-1 text-sm bg-primary/10 px-2 py-1 rounded-md">
                        <Star className="w-3 h-3 fill-current" /> {chore.points}
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive" onClick={() => handleDelete(chore.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <h3 className="font-serif text-xl font-bold mb-2 leading-tight">{chore.title}</h3>
                  
                  <div className="space-y-2 mb-6">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" /> 
                      <span className={chore.isOverdue ? "text-destructive font-semibold" : ""}>
                        Due {chore.dueDate ? format(new Date(chore.dueDate), 'MMM d') : 'Anytime'}
                      </span>
                    </div>
                    {chore.assigneeName && (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] font-bold">
                          {chore.assigneeName.charAt(0)}
                        </div>
                        {chore.assigneeName}
                      </div>
                    )}
                  </div>

                  <Button 
                    onClick={() => handleComplete(chore.id)}
                    className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                    variant={chore.isOverdue ? "default" : "secondary"}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark Complete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {completedChores.length > 0 && (
        <div className="space-y-6 pt-8 border-t border-border">
          <h2 className="text-2xl font-serif font-semibold text-muted-foreground">Recently Completed</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
            {completedChores.map(chore => (
              <Card key={chore.id} className="bg-muted/50 border-transparent relative group">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold line-through decoration-2 decoration-foreground/30">{chore.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Done by {chore.completedBy} on {chore.completedAt ? format(new Date(chore.completedAt), 'MMM d') : 'recently'}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive absolute right-4" onClick={() => handleDelete(chore.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
