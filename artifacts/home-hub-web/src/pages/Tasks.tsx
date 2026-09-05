import { useState } from "react";
import { 
  useGetTodoLists, getGetTodoListsQueryKey, 
  useGetTodoItems, getGetTodoItemsQueryKey, 
  useUpdateTodoItem, useAddTodoItem, useBulkAddTodoItems,
  useCreateTodoList, useDeleteTodoList,
  useDeleteTodoItem, useMoveTodoListToTop
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Check, Trash2, ArrowUp, CalendarClock, X } from "lucide-react";
import { usePreferences } from "@/context/PreferencesContext";
import { formatDateOnly, getLocalDateOnly } from "@/lib/dateOnly";

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
    <div className="space-y-4 sm:space-y-8">
      <div className="flex items-start justify-between gap-3 sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-3xl font-bold sm:gap-3 sm:text-4xl">
            <CheckSquare className="h-7 w-7 text-accent-foreground sm:h-8 sm:w-8" /> Tasks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">Projects, packing lists, and to-dos.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="min-h-10 shrink-0 gap-1.5 px-3 shadow-md sm:gap-2 sm:px-4">
              <Plus className="h-4 w-4"/><span className="hidden min-[360px]:inline">New List</span>
            </Button>
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

      <div className={`grid grid-cols-1 ${preferences.tabs.tasks.layout === "columns" ? "lg:grid-cols-2" : ""} gap-3 sm:gap-6`}>
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
  const bulkAddItems = useBulkAddTodoItems();
  const deleteItem = useDeleteTodoItem();
  const deleteList = useDeleteTodoList();
  const moveToTop = useMoveTodoListToTop();
  
  const [newItemContent, setNewItemContent] = useState("");
  const [newItemDueDate, setNewItemDueDate] = useState("");
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null);
  const [dueDateError, setDueDateError] = useState<{ itemId: string; message: string } | null>(null);
  const [addError, setAddError] = useState("");
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkDefaultDueDate, setBulkDefaultDueDate] = useState(() => getLocalDateOnly());
  const [bulkError, setBulkError] = useState("");
  const [bulkResult, setBulkResult] = useState("");

  const handleToggle = (item: any) => {
    updateItem.mutate(
      { id: item.id, data: { completed: !item.completed } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(list.id) }) }
    );
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemContent.trim()) {
      setAddError("Enter a task name.");
      return;
    }
    if (newItemDueDate && !isValidDate(newItemDueDate)) {
      setAddError("Choose a valid due date.");
      return;
    }
    setAddError("");
    addItem.mutate(
      {
        id: list.id,
        data: {
          content: newItemContent.trim(),
          ...(newItemDueDate && { dueDate: newItemDueDate }),
          ...(list.assigneeId && { assigneeId: list.assigneeId }),
        },
      },
      { 
        onSuccess: () => {
          setNewItemContent("");
          setNewItemDueDate("");
          queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(list.id) });
        },
        onError: () => setAddError("Could not add task. Please try again."),
      }
    );
  };

  const handleDueDateChange = (itemId: string, dueDate: string | null) => {
    updateItem.mutate(
      { id: itemId, data: { dueDate } },
      {
        onSuccess: () => {
          setEditingDueDateId(null);
          setDueDateError(null);
          queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(list.id) });
        },
        onError: () => setDueDateError({ itemId, message: "Could not update due date. Please try again." }),
      },
    );
  };

  const handleBulkAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseBulkTasks(bulkText, bulkDefaultDueDate);
    if ("error" in parsed) {
      setBulkError(parsed.error);
      setBulkResult("");
      return;
    }

    setBulkError("");
    setBulkResult("");
    bulkAddItems.mutate(
      {
        id: list.id,
        data: {
          defaultDueDate: bulkDefaultDueDate,
          items: parsed.items.map((item) => ({
            ...item,
            ...(list.assigneeId && { assigneeId: list.assigneeId }),
          })),
        },
      },
      {
        onSuccess: (result) => {
          setBulkText("");
          setBulkResult(`${result.items.length} tasks added.`);
          queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(list.id) });
        },
        onError: () => setBulkError("Could not add tasks. No tasks were added."),
      },
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
    <Card className="flex max-h-none flex-col border-border bg-card/50 shadow-sm sm:max-h-[500px]">
      <div className="group flex items-center justify-between border-b border-border bg-muted/20 p-3 sm:p-4">
        <div className="flex flex-col">
          <h3 className="font-serif text-lg font-bold sm:text-xl">{list.name}</h3>
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
          <Button variant="ghost" size="icon" onClick={handleDeleteList} className="text-muted-foreground transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <CardContent className="flex-1 space-y-1 overflow-visible p-2 sm:space-y-2 sm:overflow-y-auto sm:p-4">
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1,2].map(i => <div key={i} className="h-10 bg-muted rounded-lg w-full"></div>)}
          </div>
        ) : items?.length === 0 ? (
          <div className="text-center p-4 text-muted-foreground italic text-sm">No tasks yet.</div>
        ) : (
          items?.map((item: any) => (
            <div
              key={item.id} 
              className={`group flex items-start gap-2 rounded-lg border p-2 transition-all sm:gap-3 sm:p-3 ${
                item.completed 
                  ? "bg-muted/30 border-transparent opacity-60" 
                  : "bg-background border-border hover:border-primary/50 shadow-sm"
              }`}
            >
              <label className="cursor-pointer" aria-label={`${item.completed ? "Mark incomplete" : "Mark complete"}: ${item.content}`}>
                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  item.completed ? "bg-accent border-accent text-accent-foreground" : "border-input bg-background"
                }`}>
                  {item.completed && <Check className="w-3 h-3" />}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={item.completed}
                  onChange={() => handleToggle(item)}
                />
              </label>
              <div className="flex-1">
                <span className={`block font-medium leading-tight ${item.completed ? "line-through decoration-2 decoration-foreground/30 text-muted-foreground" : "text-foreground"}`}>
                  {item.content}
                </span>
                {(item.dueDate || item.assigneeName) && (
                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                    {item.dueDate && <span>{formatDateOnly(item.dueDate, "MMM d")}</span>}
                    {item.assigneeName && <span>• {item.assigneeName}</span>}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1 sm:mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="hidden h-7 px-2 text-xs sm:inline-flex"
                    disabled={updateItem.isPending}
                    onClick={() => handleDueDateChange(item.id, relativeDateOnly(1))}
                  >
                    Tomorrow
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="hidden h-7 px-2 text-xs sm:inline-flex"
                    disabled={updateItem.isPending}
                    onClick={() => handleDueDateChange(item.id, relativeDateOnly(7))}
                  >
                    Next week
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={updateItem.isPending}
                    onClick={() => {
                      setEditingDueDateId(editingDueDateId === item.id ? null : item.id);
                      setDueDateError(null);
                    }}
                    aria-expanded={editingDueDateId === item.id}
                  >
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    <span className="sm:hidden">Date</span>
                    <span className="hidden sm:inline">Pick date</span>
                  </Button>
                  {item.dueDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                      disabled={updateItem.isPending}
                      onClick={() => handleDueDateChange(item.id, null)}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      Clear
                    </Button>
                  )}
                  {editingDueDateId === item.id && (
                    <Input
                      type="date"
                      defaultValue={item.dueDate ?? ""}
                      className="h-8 w-40 text-xs"
                      aria-label={`Due date for ${item.content}`}
                      onChange={(e) => {
                        if (!e.target.value || isValidDate(e.target.value)) {
                          handleDueDateChange(item.id, e.target.value || null);
                        }
                      }}
                    />
                  )}
                  {dueDateError && dueDateError.itemId === item.id && (
                    <p className="basis-full text-xs text-destructive" role="alert">
                      {dueDateError.message}
                    </p>
                  )}
                </div>
              </div>
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 shrink-0 text-muted-foreground transition-opacity hover:text-destructive sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={(e) => handleDeleteItem(item.id, e)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
      <div className="border-t border-border bg-card p-3 sm:p-4">
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
          <Input 
            value={newItemContent} 
            onChange={(e) => { setNewItemContent(e.target.value); setAddError(""); }}
            placeholder="Add a task..." 
            className="flex-1"
            aria-label={`New task for ${list.name}`}
          />
            <Input
              type="date"
              value={newItemDueDate}
              onChange={(e) => { setNewItemDueDate(e.target.value); setAddError(""); }}
              className="min-h-11 sm:w-40"
              aria-label="Due date"
            />
            <Button type="submit" variant="secondary" className="min-h-11" disabled={addItem.isPending}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">Add task</span>
            </Button>
          </div>
          {addError && <p className="text-sm text-destructive" role="alert">{addError}</p>}
        </form>
        <Dialog open={isBulkOpen} onOpenChange={(open) => {
          setIsBulkOpen(open);
          if (!open) setBulkError("");
        }}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="mt-3 min-h-11 w-full">Add multiple tasks</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add multiple tasks to {list.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleBulkAdd} className="space-y-4 pt-2">
              <div>
                <label htmlFor={`bulk-due-${list.id}`} className="mb-1 block text-sm font-medium">Default due date</label>
                <Input
                  id={`bulk-due-${list.id}`}
                  type="date"
                  value={bulkDefaultDueDate}
                  onChange={(e) => { setBulkDefaultDueDate(e.target.value); setBulkError(""); }}
                  className="min-h-11"
                  required
                />
              </div>
              <div>
                <label htmlFor={`bulk-tasks-${list.id}`} className="mb-1 block text-sm font-medium">Tasks, one per line</label>
                <Textarea
                  id={`bulk-tasks-${list.id}`}
                  value={bulkText}
                  onChange={(e) => { setBulkText(e.target.value); setBulkError(""); }}
                  placeholder={"Book plumber\nPack bags | 2026-07-15"}
                  className="min-h-40 text-base"
                  aria-describedby={`bulk-help-${list.id}`}
                  required
                />
                <p id={`bulk-help-${list.id}`} className="mt-1 text-sm text-muted-foreground">
                  Use “Task name | YYYY-MM-DD” to override the default date. Up to 50 tasks.
                </p>
              </div>
              {bulkError && <p className="text-sm text-destructive" role="alert">{bulkError}</p>}
              {bulkResult && <p className="text-sm text-primary" role="status">{bulkResult}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogClose asChild><Button type="button" variant="outline" className="min-h-11">Close</Button></DialogClose>
                <Button type="submit" className="min-h-11" disabled={bulkAddItems.isPending}>
                  {bulkAddItems.isPending ? "Adding tasks..." : "Add tasks"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function relativeDateOnly(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return getLocalDateOnly(date);
}

function parseBulkTasks(text: string, defaultDueDate: string):
  | { items: Array<{ content: string; dueDate?: string }> }
  | { error: string } {
  if (!isValidDate(defaultDueDate)) return { error: "Choose a valid default due date." };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { error: "Enter at least one task." };
  if (lines.length > 50) return { error: "Add no more than 50 tasks at once." };

  const items: Array<{ content: string; dueDate?: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const parts = lines[index].split("|");
    if (parts.length > 2) return { error: `Line ${index + 1} has more than one date separator.` };
    const content = parts[0].trim();
    const dueDate = parts.length === 2 ? parts[1].trim() : undefined;
    if (!content || content.length > 500) return { error: `Line ${index + 1} needs a task name up to 500 characters.` };
    if (dueDate !== undefined && !isValidDate(dueDate)) return { error: `Line ${index + 1} needs a date in YYYY-MM-DD format.` };
    items.push({ content, ...(dueDate && { dueDate }) });
  }
  return { items };
}
