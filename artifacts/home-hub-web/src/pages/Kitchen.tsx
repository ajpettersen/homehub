import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  useGetMealPlans, getGetMealPlansQueryKey, 
  useCreateMealPlanEntry, useDeleteMealPlanEntry,
  useGetGroceryLists, getGetGroceryListsQueryKey, 
  useCreateGroceryList, useDeleteGroceryList,
  useGetGroceryItems, getGetGroceryItemsQueryKey, 
  useUpdateGroceryItem, useAddGroceryItem, useDeleteGroceryItem,
  useGetProperties, getGetPropertiesQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Utensils, ShoppingCart, Plus, Check, Trash2 } from "lucide-react";
import { startOfWeek, format } from "date-fns";

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function MealPlan() {
  const queryClient = useQueryClient();
  const weekStart = startOfWeek(new Date()).toISOString();
  
  const { data: meals, isLoading } = useGetMealPlans({ weekStart }, { query: { queryKey: getGetMealPlansQueryKey({ weekStart }) } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  
  const createMeal = useCreateMealPlanEntry();
  const deleteMeal = useDeleteMealPlanEntry();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newMealTitle, setNewMealTitle] = useState("");
  const [newDay, setNewDay] = useState(0);
  const [newType, setNewType] = useState<"breakfast" | "lunch" | "dinner" | "snack">("dinner");

  const handleAddMeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMealTitle) return;
    createMeal.mutate(
      { data: {
        weekStart,
        dayOfWeek: newDay,
        mealType: newType,
        meal: newMealTitle,
        propertyId: properties?.[0]?.id || ''
      }},
      { onSuccess: () => {
        setIsAddOpen(false);
        setNewMealTitle("");
        queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) });
      }}
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm('Remove this meal?')) return;
    deleteMeal.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) }) });
  };

  if (isLoading) return <div className="animate-pulse font-serif text-xl p-8">Loading meals...</div>;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex justify-between items-center bg-card p-4 rounded-2xl shadow-sm border border-border">
        <h2 className="text-xl font-serif font-bold">This Week's Plan</h2>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" className="gap-2"><Plus className="w-4 h-4" /> Add Meal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Menu</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddMeal} className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">What are we eating?</label>
                <Input value={newMealTitle} onChange={(e) => setNewMealTitle(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Day</label>
                  <select 
                    value={newDay} 
                    onChange={e => setNewDay(parseInt(e.target.value))} 
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    {DAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Meal</label>
                  <select 
                    value={newType} 
                    onChange={e => setNewType(e.target.value as any)} 
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="submit" disabled={createMeal.isPending}>
                  {createMeal.isPending ? 'Adding...' : 'Add Meal'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {DAYS.map((day, idx) => {
          const dayMeals = meals?.filter(m => m.dayOfWeek === idx) || [];
          return (
            <Card key={day} className="bg-card">
              <CardContent className="p-6">
                <h3 className="text-xl font-serif font-bold border-b border-border pb-2 mb-4">{day}</h3>
                {dayMeals.length === 0 ? (
                  <p className="text-muted-foreground text-sm italic">No meals planned.</p>
                ) : (
                  <div className="space-y-4">
                    {dayMeals.map(meal => (
                      <div key={meal.id} className="flex justify-between items-start group">
                        <div className="flex gap-3 items-start">
                          <Badge variant="outline" className="shrink-0 mt-0.5">{meal.mealType}</Badge>
                          <div>
                            <p className="font-medium leading-tight">{meal.meal}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive -mr-2" onClick={() => handleDelete(meal.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function GroceryLists() {
  const queryClient = useQueryClient();
  const { data: lists, isLoading: loadingLists } = useGetGroceryLists({ query: { queryKey: getGetGroceryListsQueryKey() } });
  const { data: properties } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const activeListId = selectedListId || lists?.[0]?.id;
  
  const { data: items, isLoading: loadingItems } = useGetGroceryItems(activeListId!, { 
    query: { enabled: !!activeListId, queryKey: getGetGroceryItemsQueryKey(activeListId!) } 
  });
  
  const updateItem = useUpdateGroceryItem();
  const addItem = useAddGroceryItem();
  const deleteItem = useDeleteGroceryItem();
  const createList = useCreateGroceryList();
  const deleteList = useDeleteGroceryList();
  
  const [newItemName, setNewItemName] = useState("");
  const [isAddListOpen, setIsAddListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListPropId, setNewListPropId] = useState("");

  const handleToggle = (item: any) => {
    updateItem.mutate(
      { id: item.id, data: { checked: !item.checked } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(activeListId!) }) }
    );
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !activeListId) return;
    addItem.mutate(
      { id: activeListId, data: { name: newItemName } },
      { 
        onSuccess: () => {
          setNewItemName("");
          queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(activeListId!) });
        } 
      }
    );
  };

  const handleItemDelete = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteItem.mutate({ id: itemId }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(activeListId!) }) });
  };

  const handleAddList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName || !newListPropId) return;
    createList.mutate(
      { data: { name: newListName, propertyId: newListPropId } },
      { onSuccess: () => {
        setIsAddListOpen(false);
        setNewListName("");
        queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
      }}
    );
  };

  const handleDeleteList = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this list entirely?")) return;
    deleteList.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() }) });
  };

  if (loadingLists) return <div className="p-8 font-serif text-xl animate-pulse">Loading lists...</div>;

  return (
    <div className="mt-6 flex flex-col md:flex-row gap-8">
      <div className="w-full md:w-1/3 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-serif text-xl font-semibold">Your Lists</h3>
          <Dialog open={isAddListOpen} onOpenChange={setIsAddListOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon"><Plus className="w-4 h-4"/></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Grocery List</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddList} className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">List Name</label>
                  <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Property</label>
                  <select 
                    value={newListPropId} 
                    onChange={e => setNewListPropId(e.target.value)} 
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    required
                  >
                    <option value="">Select a property</option>
                    {properties?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                  <Button type="submit" disabled={createList.isPending}>
                    {createList.isPending ? 'Creating...' : 'Create List'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        
        {lists?.length === 0 ? (
          <div className="p-6 border-2 border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
            No lists created yet.
          </div>
        ) : (
          <div className="space-y-2">
            {lists?.map(list => (
              <button
                key={list.id}
                onClick={() => setSelectedListId(list.id)}
                className={`w-full text-left p-4 rounded-xl transition-all border group relative ${
                  activeListId === list.id 
                    ? "bg-primary text-primary-foreground border-primary shadow-md" 
                    : "bg-card border-border hover:bg-muted"
                }`}
              >
                <div className="font-bold">{list.name}</div>
                <div className={`text-sm mt-1 ${activeListId === list.id ? 'opacity-80' : 'text-muted-foreground'}`}>
                  {list.itemCount} items ({list.checkedCount} checked)
                </div>
                <div 
                  className={`absolute top-4 right-4 p-1 rounded-md transition-opacity hover:bg-destructive/20 hover:text-destructive ${
                    activeListId === list.id ? 'text-primary-foreground/50' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => handleDeleteList(list.id, e)}
                >
                  <Trash2 className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      <div className="w-full md:w-2/3">
        {activeListId ? (
          <Card className="bg-card shadow-sm">
            <CardContent className="p-6">
              <h3 className="font-serif text-2xl font-bold mb-6 flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-primary" />
                {lists?.find(l => l.id === activeListId)?.name || 'Grocery List'}
              </h3>
              
              <form onSubmit={handleAdd} className="flex gap-2 mb-6">
                <Input 
                  value={newItemName} 
                  onChange={(e) => setNewItemName(e.target.value)} 
                  placeholder="Add new item..." 
                  className="flex-1 bg-muted/50"
                />
                <Button type="submit"><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </form>

              {loadingItems ? (
                <div className="animate-pulse space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded-lg"></div>)}
                </div>
              ) : items?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">List is empty.</p>
              ) : (
                <div className="space-y-2">
                  {items?.map(item => (
                    <label 
                      key={item.id} 
                      className={`flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer group ${
                        item.checked 
                          ? "bg-muted/30 border-transparent opacity-60" 
                          : "bg-background border-border hover:border-primary/50 shadow-sm"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        item.checked ? "bg-primary border-primary text-primary-foreground" : "border-input bg-background"
                      }`}>
                        {item.checked && <Check className="w-4 h-4" />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={item.checked}
                        onChange={() => handleToggle(item)}
                      />
                      <span className={`flex-1 font-medium ${item.checked ? "line-through decoration-2 decoration-foreground/30" : ""}`}>
                        {item.name}
                      </span>
                      {item.quantity && (
                        <Badge variant="secondary" className="text-xs shrink-0">{item.quantity}</Badge>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100" onClick={(e) => handleItemDelete(item.id, e)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="h-full flex items-center justify-center border-2 border-dashed border-border rounded-2xl p-12 text-muted-foreground">
            Select or create a list to view items.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Kitchen() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-serif font-bold flex items-center gap-3">
          <Utensils className="w-8 h-8 text-secondary" /> The Kitchen
        </h1>
        <p className="text-muted-foreground mt-2">Meal planning and grocery runs.</p>
      </div>

      <Tabs defaultValue="meals" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-12">
          <TabsTrigger value="meals" className="text-base">Meal Plan</TabsTrigger>
          <TabsTrigger value="groceries" className="text-base">Grocery Lists</TabsTrigger>
        </TabsList>
        <TabsContent value="meals">
          <MealPlan />
        </TabsContent>
        <TabsContent value="groceries">
          <GroceryLists />
        </TabsContent>
      </Tabs>
    </div>
  );
}
