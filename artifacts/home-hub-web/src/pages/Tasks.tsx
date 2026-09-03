import { useState } from "react";
import { 
  useGetTodoLists, getGetTodoListsQueryKey, 
  useGetTodoItems, getGetTodoItemsQueryKey, 
  useUpdateTodoItem, useAddTodoItem,
  useCreateTodoList, useDeleteTodoList,
  useDeleteTodoItem, useMoveTodoListToTop
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Check, Trash2, ArrowUp } from "lucide-react";
import { format } from "date-fns";
import { usePreferences } from "@/context/PreferencesContext";

export default function Tasks() {
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const { data: lists, isLoading: loadingLists } = useGetTodoLists({ query: { queryKey: getGetTodoListsQueryKey() } });
  
  const createList = useCreateTodoList();
  const [newListName, setNewListName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    createList.mutate(
      { data: { name: newListName } },
      { onSuccess: () => {
        setNewListName("");
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() });
      }}
    );
  };

  if (loadingLists) return <div className="p-8 font-serif text-xl text-muted-foreground animate-pulse">Loading tasks...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold flex items-center gap-3">
            <CheckSquare className="w-8 h-8 text-accent-foreground" /> Tasks
          </h1>
          <p className="text-muted-foreground mt-2">Projects, packing lists, and to-dos.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-md"><Plus className="w-4 h-4"/> New List</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a New List</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateList} className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">List Name</label>
                <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} autoFocus required />
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="submit" disabled={createList.isPending}>
                  {createList.isPending ? 'Creating...' : 'Create List'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className={`grid grid-cols-1 ${preferences.tabs.tasks.layout === "columns" ? "lg:grid-cols-2" : ""} gap-6`}>
        {lists?.map((list, index) => (
          <TodoListCard key={list.id} list={list} isFirst={index === 0} />
        ))}
        {lists?.length === 0 && (
          <div className="col-span-full p-12 border-2 border-dashed border-border rounded-3xl text-center bg-card">
            <h3 className="text-xl font-serif font-semibold mb-2">No lists yet!</h3>
            <p className="text-muted-foreground">Create a list to start tracking tasks.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TodoListCard({ list, isFirst }: { list: any; isFirst: boolean }) {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useGetTodoItems(list.id, { query: { enabled: !!list.id, queryKey: getGetTodoItemsQueryKey(list.id) } });
  
  const updateItem = useUpdateTodoItem();
  const addItem = useAddTodoItem();
  const deleteItem = useDeleteTodoItem();
  const deleteList = useDeleteTodoList();
  const moveToTop = useMoveTodoListToTop();
  
  const [newItemContent, setNewItemContent] = useState("");

  const handleToggle = (item: any) => {
    updateItem.mutate(
      { id: item.id, data: { completed: !item.completed } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(list.id) }) }
    );
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemContent.trim()) return;
    addItem.mutate(
      { id: list.id, data: { content: newItemContent } },
      { 
        onSuccess: () => {
          setNewItemContent("");
          queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(list.id) });
        } 
      }
    );
  };

  const handleDeleteItem = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Delete this task?')) return;
    deleteItem.mutate({ id: itemId }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(list.id) })
    });
  };

  const handleMoveToTop = () => {
    moveToTop.mutate({ id: list.id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() })
    });
  };

  const handleDeleteList = () => {
    if (!confirm('Are you sure you want to delete this list and all its tasks?')) return;
    deleteList.mutate({ id: list.id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() })
    });
  };

  return (
    <Card className="bg-card/50 shadow-sm border-border flex flex-col max-h-[500px]">
      <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center group">
        <div className="flex flex-col">
          <h3 className="font-serif text-xl font-bold">{list.name}</h3>
          {list.assigneeName && <Badge variant="secondary" className="w-fit mt-1">{list.assigneeName}</Badge>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isFirst && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMoveToTop}
              disabled={moveToTop.isPending}
              title="Move to top"
              data-testid={`button-move-to-top-${list.id}`}
              className="text-muted-foreground hover:text-primary"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleDeleteList} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <CardContent className="p-4 flex-1 overflow-y-auto space-y-2">
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1,2].map(i => <div key={i} className="h-10 bg-muted rounded-lg w-full"></div>)}
          </div>
        ) : items?.length === 0 ? (
          <div className="text-center p-4 text-muted-foreground italic text-sm">No tasks yet.</div>
        ) : (
          items?.map((item: any) => (
            <label 
              key={item.id} 
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${
                item.completed 
                  ? "bg-muted/30 border-transparent opacity-60" 
                  : "bg-background border-border hover:border-primary/50 shadow-sm"
              }`}
            >
              <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                item.completed ? "bg-accent border-accent text-accent-foreground" : "border-input bg-background"
              }`}>
                {item.completed && <Check className="w-3 h-3" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={item.completed}
                onChange={() => handleToggle(item)}
              />
              <div className="flex-1">
                <span className={`block font-medium leading-tight ${item.completed ? "line-through decoration-2 decoration-foreground/30 text-muted-foreground" : "text-foreground"}`}>
                  {item.content}
                </span>
                {(item.dueDate || item.assigneeName) && (
                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                    {item.dueDate && <span>{format(new Date(item.dueDate), 'MMM d')}</span>}
                    {item.assigneeName && <span>• {item.assigneeName}</span>}
                  </div>
                )}
              </div>
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDeleteItem(item.id, e)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </label>
          ))
        )}
      </CardContent>
      <div className="p-4 border-t border-border bg-card">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input 
            value={newItemContent} 
            onChange={(e) => setNewItemContent(e.target.value)} 
            placeholder="Add a task..." 
            className="flex-1"
          />
          <Button type="submit" variant="secondary"><Plus className="w-4 h-4" /></Button>
        </form>
      </div>
    </Card>
  );
}
