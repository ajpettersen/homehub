import type { KitchenInventoryItem } from "@/hooks/useKitchenInventory";

export function getMatchedInventoryNames(ingredients: { name: string }[], inventory: KitchenInventoryItem[]): string[] {
  if (!inventory || inventory.length === 0) return [];
  const matched = new Set<string>();
  
  for (const ing of ingredients) {
    const ingName = ing.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    for (const inv of inventory) {
      const invName = inv.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (ingName === invName || ` ${ingName} `.includes(` ${invName} `) || ` ${invName} `.includes(` ${ingName} `)) {
        matched.add(inv.name);
      }
    }
  }
  return Array.from(matched);
}
