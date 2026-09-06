import { Router } from "express";
import { db, GROCERY_CATEGORY_KEYS, kitchenInventoryItemsTable, type GroceryCategoryKey } from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();
const categorySet = new Set<string>(GROCERY_CATEGORY_KEYS);
const normalizeName = (name: string) => name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const toJson = (item: typeof kitchenInventoryItemsTable.$inferSelect) => ({
  id: String(item.id),
  propertyId: String(item.propertyId),
  name: item.name,
  category: item.categoryKey,
  quantity: item.quantity,
  sourceType: item.sourceType,
  observedAt: item.observedAt.toISOString(),
});

router.get("/kitchen-inventory", async (req, res) => {
  const scope = getApprovedHouseholdScope(res);
  const propertyId = Number(req.query.propertyId);
  if (!Number.isInteger(propertyId) || !scope.propertyIds.includes(propertyId)) {
    res.status(403).json({ error: "Property access denied" });
    return;
  }
  const items = await db.select().from(kitchenInventoryItemsTable)
    .where(eq(kitchenInventoryItemsTable.propertyId, propertyId))
    .orderBy(asc(kitchenInventoryItemsTable.categoryKey), asc(kitchenInventoryItemsTable.name));
  res.json(items.map(toJson));
});

router.put("/kitchen-inventory", async (req, res) => {
  const scope = getApprovedHouseholdScope(res);
  const propertyId = Number(req.body?.propertyId);
  const items = req.body?.items;
  if (!Number.isInteger(propertyId) || !scope.propertyIds.includes(propertyId)) {
    res.status(403).json({ error: "Property access denied" });
    return;
  }
  if (!Array.isArray(items) || items.length > 200) {
    res.status(400).json({ error: "items must be an array of at most 200 ingredients" });
    return;
  }
  const clean = items.flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 200) : "";
    const normalizedName = normalizeName(name);
    if (!normalizedName) return [];
    const categoryKey = categorySet.has(String(item.category)) ? String(item.category) as GroceryCategoryKey : "other";
    const quantity = typeof item.quantity === "string" && item.quantity.trim() ? item.quantity.trim().slice(0, 100) : null;
    return [{ propertyId, name, normalizedName, categoryKey, quantity, sourceType: "photo" as const }];
  });
  const unique = [...new Map(clean.map(item => [item.normalizedName, item])).values()];
  const saved = await db.transaction(async tx => {
    await tx.delete(kitchenInventoryItemsTable).where(eq(kitchenInventoryItemsTable.propertyId, propertyId));
    if (!unique.length) return [];
    return tx.insert(kitchenInventoryItemsTable).values(unique).returning();
  });
  res.json(saved.map(toJson));
});

router.post("/kitchen-inventory/items", async (req, res) => {
  const scope = getApprovedHouseholdScope(res);
  const propertyId = Number(req.body?.propertyId);
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 200) : "";
  if (!Number.isInteger(propertyId) || !scope.propertyIds.includes(propertyId)) {
    res.status(403).json({ error: "Property access denied" });
    return;
  }
  const normalizedName = normalizeName(name);
  if (!normalizedName) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const categoryKey = categorySet.has(String(req.body?.category)) ? req.body.category as GroceryCategoryKey : "other";
  const quantity = typeof req.body?.quantity === "string" && req.body.quantity.trim()
    ? req.body.quantity.trim().slice(0, 100)
    : null;
  const [saved] = await db.insert(kitchenInventoryItemsTable)
    .values({ propertyId, name, normalizedName, categoryKey, quantity, sourceType: "manual" })
    .onConflictDoUpdate({
      target: [kitchenInventoryItemsTable.propertyId, kitchenInventoryItemsTable.normalizedName],
      set: { name, categoryKey, quantity, sourceType: "manual", observedAt: new Date() },
    }).returning();
  res.status(201).json(toJson(saved));
});

router.delete("/kitchen-inventory/items/:id", async (req, res) => {
  const scope = getApprovedHouseholdScope(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid inventory item" });
    return;
  }
  const [deleted] = await db.delete(kitchenInventoryItemsTable)
    .where(and(
      eq(kitchenInventoryItemsTable.id, id),
      inArray(kitchenInventoryItemsTable.propertyId, scope.propertyIds),
    ))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }
  res.status(204).end();
});

export default router;