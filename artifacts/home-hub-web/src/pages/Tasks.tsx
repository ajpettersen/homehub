import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { 
  useGetTodoLists, getGetTodoListsQueryKey, 
  useGetTodoItems, getGetTodoItemsQueryKey, 
  useUpdateTodoItem, useAddTodoItem, useBulkAddTodoItems,
  useCreateTodoList, useDeleteTodoList,
  useDeleteTodoItem, useMoveTodoListToTop, getGetDashboardQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Check, Trash2, ArrowUp, CalendarClock, X, Clock } from "lucide-react";
import { usePreferences } from "@/context/PreferencesContext";
import { formatDateOnly, getLocalDateOnly } from "@/lib/dateOnly";
import Maintenance from "./Maintenance";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

export default function Tasks() {
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const activeTab = searchParams.get("view") === "maintenance" ? "maintenance" : "todos";

  const handleTabChange = (tab: "todos" | "maintenance") => {
    setLocation(`/tasks?view=${tab}`, { replace: true });
  };

  const {
    data: lists,
    isLoading: loadingLists,
    isError: listsFailed,
    refetch: retryLists,
  } = useGetTodoLists({ query: { queryKey: getGetTodoListsQueryKey(), retry: false, enabled: activeTab === "todos" } });

  const createList = useCreateTodoList();
  const [newListName, setNewListName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createListError, setCreateListError] = useState("");

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setCreateListError("");
    createList.mutate(
      { data: { name: newListName } },
      { onSuccess: () => {
        setNewListName("");
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() });
      },
      onError: () => setCreateListError("Could not create this list. Please try again."),
      }
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-3xl font-bold sm:gap-3 sm:text-4xl">
            <CheckSquare className="h-7 w-7 text-accent-foreground sm:h-8 sm:w-8" /> Tasks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">To-dos, packing lists, and property maintenance.</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50 shadow-sm shrink-0 self-start sm:self-auto min-h-11">
          <button
            data-testid="tab-todos"
            onClick={() => handleTabChange("todos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all min-h-full ${
              activeTab === "todos" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <CheckSquare className="w-4 h-4" /> To-dos
          </button>
          <button
            data-testid="tab-maintenance"
            onClick={() => handleTabChange("maintenance")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all min-h-full ${
              activeTab === "maintenance" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Clock className="w-4 h-4" /> Property Maintenance
          </button>
        </div>
      </div>

      {activeTab === "maintenance" ? (
        <div className="pt-2 animate-in fade-in duration-300">
          <Maintenance isEmbedded />
        </div>
      ) : (
        <div className="animate-in fade-in duration-300">
          <div className="flex justify-end mb-4">
            <Dialog open={isCreateOpen} onOpenChange={(open) => {
              setIsCreateOpen(open);
              if (!open) setCreateListError("");
            }}>
              <DialogTrigger asChild>
                <Button className="min-h-11 shrink-0 gap-1.5 px-4 shadow-md sm:gap-2">
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
                     <Input className="min-h-11" value={newListName} onChange={(e) => { setNewListName(e.target.value); setCreateListError(""); }} autoFocus required />
                  </div>
                   {createListError && <p className="text-sm text-destructive" role="alert">{createListError}</p>}
                  <div className="flex justify-end gap-2">
                    <DialogClose asChild><Button type="button" variant="outline" className="min-h-11">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={createList.isPending} className="min-h-11">
                      {createList.isPending ? 'Creating...' : 'Create List'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loadingLists ? (
            <div className="p-8 font-serif text-xl text-muted-foreground animate-pulse">Loading tasks...</div>
          ) : listsFailed || !lists ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-destructive/30 bg-card px-5 py-12 text-center" role="alert">
              <CheckSquare className="mb-3 h-10 w-10 text-destructive" />
              <h1 className="font-serif text-2xl font-bold">Tasks couldn’t load</h1>
              <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
              <Button type="button" className="mt-5 min-h-11" onClick={() => void retryLists()}>
                Try again
              </Button>
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}

function TodoListCard({ list, isFirst }: { list: any; isFirst: boolean }) {
  const queryClient = useQueryClient();
  const {
    data: items,
    isLoading,
    isError: itemsFailed,
    refetch: retryItems,
  } = useGetTodoItems(list.id, { query: { enabled: !!list.id, queryKey: getGetTodoItemsQueryKey(list.id), retry: false } });

  const updateItem = useUpdateTodoItem();
  const addItem = useAddTodoItem();
  const bulkAddItems = useBulkAddTodoItems();
  const deleteItem = useDeleteTodoItem();
  const deleteList = useDeleteTodoList();
  const moveToTop = useMoveTodoListToTop();

  const [newItemContent, setNewItemContent] = useState("");
  const [newItemDueDate, setNewItemDueDate] = useState("");
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null);

  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [dueDateErrors, setDueDateErrors] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState("");
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkDefaultDueDate, setBulkDefaultDueDate] = useState(() => getLocalDateOnly());
  const [bulkError, setBulkError] = useState("");
  const [bulkResult, setBulkResult] = useState("");
  const [listActionError, setListActionError] = useState("");

  const clearItemError = (id: string) => {
    setItemErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const clearDueDateError = (id: string) => {
    setDueDateErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(list.id) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const handleToggle = (item: any) => {
    if (updateItem.isPending && updateItem.variables?.id === item.id) return;
    clearItemError(item.id);
    updateItem.mutate(
      { id: item.id, data: { completed: !item.completed } },
      {
        onSuccess: invalidateTasks,
        onError: () => setItemErrors(prev => ({ ...prev, [item.id]: "Could not update task." })),
      }
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
          invalidateTasks();
        },
        onError: () => setAddError("Could not add task. Please try again."),
      }
    );
  };

  const handleDueDateChange = (itemId: string, dueDate: string | null) => {
    if (updateItem.isPending && updateItem.variables?.id === itemId) return;
    clearDueDateError(itemId);
    updateItem.mutate(
      { id: itemId, data: { dueDate } },
      {
        onSuccess: () => {
          setEditingDueDateId(null);
          invalidateTasks();
        },
        onError: () => setDueDateErrors(prev => ({ ...prev, [itemId]: "Could not update date." })),
      }
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
          setBulkResult(`${result.items.length} tasks added successfully.`);
          invalidateTasks();
        },
        onError: () => setBulkError("Could not add tasks. No tasks were added."),
      }
    );
  };

  const [deleteTaskTarget, setDeleteTaskTarget] = useState<{ id: string } | null>(null);
  const [deleteListTarget, setDeleteListTarget] = useState<{ id: string } | null>(null);

  const handleDeleteItem = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTaskTarget({ id: itemId });
  };

  const confirmDeleteTask = () => {
    if (!deleteTaskTarget) return;
    clearItemError(deleteTaskTarget.id);
    deleteItem.mutate({ id: deleteTaskTarget.id }, {
      onSuccess: () => {
        setDeleteTaskTarget(null);
        invalidateTasks();
      },
      onError: () => setItemErrors(prev => ({ ...prev, [deleteTaskTarget.id]: "Could not delete task." })),
    });
  };

  const handleMoveToTop = () => {
    setListActionError("");
    moveToTop.mutate({ id: list.id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() }),
      onError: () => setListActionError("Could not move this list. Please try again."),
    });
  };

  const handleDeleteList = () => {
    setDeleteListTarget({ id: list.id });
  };

  const confirmDeleteList = () => {
    if (!deleteListTarget) return;
    setListActionError("");
    deleteList.mutate({ id: deleteListTarget.id }, {
      onSuccess: () => {
        setDeleteListTarget(null);
        queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() });
      },
      onError: () => setListActionError("Could not delete this list. Please try again."),
    });
  };

  return (
    <Card className="flex flex-col border-border bg-card/50 shadow-sm">
      <div className="group flex items-center justify-between border-b border-border bg-muted/20 p-3 sm:p-4">
        <div className="flex flex-col">
          <h3 className="font-serif text-lg font-bold sm:text-xl break-words min-w-0">{list.name}</h3>
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
              className="text-muted-foreground hover:text-primary min-h-[44px] min-w-[44px]"
            >
              <ArrowUp className="w-5 h-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleDeleteList} className="text-muted-foreground transition-opacity hover:text-destructive min-h-[44px] min-w-[44px] sm:opacity-0 sm:group-hover:opacity-100">
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <CardContent className="flex-1 space-y-2 overflow-visible p-3 sm:p-4">
        {listActionError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{listActionError}</p>}
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1,2].map(i => <div key={i} className="h-12 bg-muted rounded-lg w-full"></div>)}
          </div>
        ) : itemsFailed || !items ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center" role="alert">
            <p className="text-sm font-medium text-destructive">Tasks in this list couldn’t load.</p>
            <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => void retryItems()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center p-4 text-muted-foreground italic text-sm">No tasks yet.</div>
        ) : (
          items.map((item: any) => (
            <div
              key={item.id} 
              className={`group flex items-start gap-3 rounded-lg border p-3 transition-all ${
                item.completed 
                  ? "bg-muted/30 border-transparent opacity-60" 
                  : "bg-background border-border hover:border-primary/50 shadow-sm"
              }`}
            >
              <label className={`pt-0.5 shrink-0 ${updateItem.isPending && updateItem.variables?.id === item.id ? "cursor-wait opacity-60" : "cursor-pointer"}`} aria-label={`${item.completed ? "Mark incomplete" : "Mark complete"}: ${item.content}`}>
                <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 ${
                  item.completed ? "bg-accent border-accent text-accent-foreground" : "border-input bg-background"
                }`}>
                  {item.completed && <Check className="w-4 h-4" />}
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={item.completed}
                    disabled={updateItem.isPending && updateItem.variables?.id === item.id}
                    onChange={() => handleToggle(item)}
                  />
                </div>
              </label>
              <div className="flex-1 min-w-0">
                <span className={`block font-medium leading-tight break-words ${item.completed ? "line-through decoration-2 decoration-foreground/30 text-muted-foreground" : "text-foreground"}`}>
                  {item.content}
                </span>
                {(item.dueDate || item.assigneeName) && (
                  <div className="flex gap-2 mt-1.5 text-xs text-muted-foreground font-medium">
                    {item.dueDate && <span>{formatDateOnly(item.dueDate, "MMM d")}</span>}
                    {item.assigneeName && <span>• {item.assigneeName}</span>}
                  </div>
                )}

                {itemErrors[item.id] && (
                  <p className="mt-1 text-xs text-destructive font-medium" role="alert">{itemErrors[item.id]}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="hidden min-h-[36px] px-2.5 text-xs sm:inline-flex bg-muted/50 hover:bg-muted"
                    disabled={updateItem.isPending && updateItem.variables?.id === item.id}
                    onClick={() => handleDueDateChange(item.id, relativeDateOnly(1))}
                  >
                    Tomorrow
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="hidden min-h-[36px] px-2.5 text-xs sm:inline-flex bg-muted/50 hover:bg-muted"
                    disabled={updateItem.isPending && updateItem.variables?.id === item.id}
                    onClick={() => handleDueDateChange(item.id, relativeDateOnly(7))}
                  >
                    Next week
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-[36px] gap-1.5 px-2.5 text-xs bg-muted/50 hover:bg-muted"
                    disabled={updateItem.isPending && updateItem.variables?.id === item.id}
                    onClick={() => {
                      setEditingDueDateId(editingDueDateId === item.id ? null : item.id);
                      clearDueDateError(item.id);
                    }}
                    aria-expanded={editingDueDateId === item.id}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sm:hidden">Date</span>
                    <span className="hidden sm:inline">Pick date</span>
                  </Button>
                  {item.dueDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-[36px] gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 bg-muted/50"
                      disabled={updateItem.isPending && updateItem.variables?.id === item.id}
                      onClick={() => handleDueDateChange(item.id, null)}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Clear
                    </Button>
                  )}
                  {editingDueDateId === item.id && (
                    <Input
                      type="date"
                      defaultValue={item.dueDate ?? ""}
                      className="min-h-[36px] w-auto text-xs"
                      aria-label={`Due date for ${item.content}`}
                      onChange={(e) => {
                        if (!e.target.value || isValidDate(e.target.value)) {
                          handleDueDateChange(item.id, e.target.value || null);
                        }
                      }}
                    />
                  )}
                  {dueDateErrors[item.id] && (
                    <p className="basis-full text-xs text-destructive font-medium" role="alert">
                      {dueDateErrors[item.id]}
                    </p>
                  )}
                </div>
              </div>
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                onClick={(e) => handleDeleteItem(item.id, e)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
      <div className="border-t border-border bg-card p-3 sm:p-4 rounded-b-xl">
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newItemContent}
              onChange={(e) => { setNewItemContent(e.target.value); setAddError(""); }}
              placeholder="Add a task..."
              className="flex-1 min-h-11"
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
              <Plus className="w-5 h-5 mr-1 sm:mr-0" aria-hidden="true" />
              <span className="sm:hidden font-bold">Add Task</span>
            </Button>
          </div>
          {addError && <p className="text-sm text-destructive font-medium" role="alert">{addError}</p>}
        </form>
        <Dialog open={isBulkOpen} onOpenChange={(open: boolean) => {
          setIsBulkOpen(open);
          if (!open) {
            setBulkError("");
            setBulkResult("");
          }
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
                  onChange={(e) => { setBulkDefaultDueDate(e.target.value); setBulkError(""); setBulkResult(""); }}
                  className="min-h-11"
                  required
                />
              </div>
              <div>
                <label htmlFor={`bulk-tasks-${list.id}`} className="mb-1 block text-sm font-medium">Tasks, one per line</label>
                <Textarea
                  id={`bulk-tasks-${list.id}`}
                  value={bulkText}
                  onChange={(e) => { setBulkText(e.target.value); setBulkError(""); setBulkResult(""); }}
                  placeholder={"Book plumber\nPack bags | 2026-07-15"}
                  className="min-h-[160px] text-base"
                  aria-describedby={`bulk-help-${list.id}`}
                  required
                />
                <p id={`bulk-help-${list.id}`} className="mt-1.5 text-sm text-muted-foreground">
                  Use “Task name | YYYY-MM-DD” to override the default date. Up to 50 tasks.
                </p>
              </div>
              {bulkError && <p className="text-sm text-destructive font-medium" role="alert">{bulkError}</p>}
              {bulkResult && <p className="text-sm text-primary font-bold bg-primary/10 px-3 py-2 rounded-lg" role="status">{bulkResult}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-2">
                <DialogClose asChild><Button type="button" variant="outline" className="min-h-11">Close</Button></DialogClose>
                <Button type="submit" className="min-h-11" disabled={bulkAddItems.isPending}>
                  {bulkAddItems.isPending ? "Adding tasks..." : "Add tasks"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <ConfirmActionDialog
        open={!!deleteTaskTarget}
        onOpenChange={(open: boolean) => !open && setDeleteTaskTarget(null)}
        title="Delete task?"
        description="This task will be permanently removed."
        confirmLabel="Delete task"
        destructive
        pending={deleteItem.isPending}
        error={deleteTaskTarget && itemErrors[deleteTaskTarget.id] ? itemErrors[deleteTaskTarget.id] : null}
        onConfirm={confirmDeleteTask}
      />
      <ConfirmActionDialog
        open={!!deleteListTarget}
        onOpenChange={(open: boolean) => !open && setDeleteListTarget(null)}
        title={`Delete ${list.name}?`}
        description="This list and all its tasks will be permanently removed. This action cannot be undone."
        confirmLabel="Delete list"
        destructive
        pending={deleteList.isPending}
        error={listActionError && deleteList.isError ? listActionError : null}
        onConfirm={confirmDeleteList}
      />
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
