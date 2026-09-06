import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type KitchenInventoryItem = {
  id: string;
  propertyId: string;
  name: string;
  category: string;
  quantity?: string | null;
  sourceType: string;
  observedAt: string;
};

export function useGetInventory(propertyId: string) {
  return useQuery({
    queryKey: ["kitchen-inventory", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/kitchen-inventory?propertyId=${propertyId}`);
      if (!res.ok) throw new Error("Failed to load inventory");
      return (await res.json()) as KitchenInventoryItem[];
    },
    enabled: !!propertyId
  });
}

export function useAddInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { propertyId: string; name: string; category: string; quantity?: string }) => {
      const res = await fetch("/api/kitchen-inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to add inventory item");
      }
      return null;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["kitchen-inventory", variables.propertyId] });
    }
  });
}

export function useDeleteInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, propertyId }: { id: string; propertyId: string }) => {
      const res = await fetch(`/api/kitchen-inventory/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete inventory item");
      }
      return null;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["kitchen-inventory", variables.propertyId] });
    }
  });
}
