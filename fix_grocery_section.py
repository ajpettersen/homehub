import re

with open("artifacts/home-hub-web/src/pages/Kitchen.tsx", "r") as f:
    content = f.read()

new_func = """function GrocerySection({ propertyId, meals }: { propertyId: string; meals: MealForShopping[] }) {
  const queryClient = useQueryClient();

  const { data: lists } = useGetGroceryLists({ query: { queryKey: getGetGroceryListsQueryKey() } });
  const createList = useCreateGroceryList();

  const propertyLists = lists?.filter(list => String(list.propertyId) === String(propertyId)) ?? [];
  const mainList = propertyLists[0];

  // Auto-create a "Weekly Shopping" list if none exist
  React.useEffect(() => {
    if (lists && propertyLists.length === 0 && propertyId && !createList.isPending) {
      createList.mutate(
        { data: { name: "Weekly Shopping", propertyId } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() }) }
      );
    }
  }, [lists, propertyId]);

  if (!mainList) return (
    <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
      <Loader2 className="w-5 h-5 animate-spin" /> Setting up shopping list…
    </div>
  );

  return <GroceryListDetail list={mainList} meals={meals} />;
}"""

start_str = "function GrocerySection({ propertyId, meals }: { propertyId: string; meals: MealForShopping[] }) {"
end_str = "  return <GroceryListDetail list={mainList} meals={meals} />;\n}"
idx1 = content.find(start_str)
idx2 = content.find(end_str, idx1)
if idx1 != -1 and idx2 != -1:
    content = content[:idx1] + new_func + content[idx2 + len(end_str):]
    with open("artifacts/home-hub-web/src/pages/Kitchen.tsx", "w") as f:
        f.write(content)
    print("Fixed GrocerySection.")
