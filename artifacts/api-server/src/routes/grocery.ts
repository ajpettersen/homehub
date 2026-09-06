import { Router } from "express";
import { db } from "@workspace/db";
import {
  groceryCatalogItemsTable,
  groceryListsTable,
  groceryItemsTable,
  householdStoresTable,
  propertiesTable,
  GROCERY_CATEGORY_KEYS,
} from "@workspace/db";
import { and, eq, sql, inArray } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";
import { ensureGroceryCatalogSeeded } from "../lib/groceryCatalog";

const router = Router();

/** Equality key used only within one grocery list; distinct lists stay independent. */
export function normalizeGroceryItemName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function canAssignStoreToList(
  listPropertyId: number,
  accessiblePropertyIds: number[],
  propertyHouseholdId: number | null,
  storeHouseholdId: number,
): boolean {
  return accessiblePropertyIds.includes(listPropertyId)
    && propertyHouseholdId !== null
    && propertyHouseholdId === storeHouseholdId;
}

router.get("/grocery-catalog", async (req, res) => {
  try {
    getApprovedHouseholdScope(res);
    await ensureGroceryCatalogSeeded();
    const query = typeof req.query.query === "string" ? req.query.query.trim().toLocaleLowerCase().slice(0, 80) : "";
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const requestedLimit = Number(req.query.limit ?? 40);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 40;

    if (category && !GROCERY_CATEGORY_KEYS.includes(category as (typeof GROCERY_CATEGORY_KEYS)[number])) {
      res.status(400).json({ error: "Invalid grocery category" });
      return;
    }

    const match = `%${query}%`;
    const rows = await db
      .select()
      .from(groceryCatalogItemsTable)
      .where(and(
        category ? eq(groceryCatalogItemsTable.categoryKey, category as (typeof GROCERY_CATEGORY_KEYS)[number]) : sql`true`,
        query ? sql`${groceryCatalogItemsTable.searchTerms} ILIKE ${match}` : sql`true`,
      ))
      .orderBy(
        query
          ? sql`CASE
              WHEN ${groceryCatalogItemsTable.normalizedName} = ${query} THEN 0
              WHEN ${groceryCatalogItemsTable.normalizedName} LIKE ${`${query}%`} THEN 1
              ELSE 2
            END`
          : sql`0`,
        groceryCatalogItemsTable.name,
      )
      .limit(limit);

    res.json(rows.map(item => ({
      id: String(item.id),
      name: item.name,
      category: item.categoryKey,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to search grocery catalog");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/grocery-lists", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    if (scope.propertyIds.length === 0) {
      res.json([]);
      return;
    }

    const lists = await db
      .select({
        list: groceryListsTable,
        propertyName: propertiesTable.name,
        itemCount: sql<number>`count(${groceryItemsTable.id})::int`,
        checkedCount: sql<number>`count(case when ${groceryItemsTable.checked} = true then 1 end)::int`,
      })
      .from(groceryListsTable)
      .leftJoin(propertiesTable, eq(groceryListsTable.propertyId, propertiesTable.id))
      .leftJoin(groceryItemsTable, eq(groceryItemsTable.listId, groceryListsTable.id))
      .where(inArray(groceryListsTable.propertyId, scope.propertyIds))
      .groupBy(groceryListsTable.id, propertiesTable.name)
      .orderBy(groceryListsTable.id);

    res.json(
      lists.map((r) => ({
        id: String(r.list.id),
        name: r.list.name,
        propertyId: String(r.list.propertyId),
        propertyName: r.propertyName ?? "",
        storeId: r.list.storeId === null ? null : String(r.list.storeId),
        itemCount: r.itemCount,
        checkedCount: r.checkedCount,
        createdAt: r.list.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get grocery lists");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/grocery-lists", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const { name, propertyId } = req.body;
    if (!name || !propertyId) {
      res.status(400).json({ error: "name and propertyId required" });
      return;
    }

    const propertyIdNum = Number(propertyId);
    if (!Number.isInteger(propertyIdNum)) {
      res.status(400).json({ error: "propertyId must be a valid id" });
      return;
    }
    if (!scope.propertyIds.includes(propertyIdNum)) {
      res.status(403).json({ error: "Property not accessible" });
      return;
    }

    const [property] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, propertyIdNum)).limit(1);
    if (!property || property.householdId !== scope.householdId) {
      res.status(403).json({ error: "Property not accessible" });
      return;
    }
    const [defaultStore] = await db.select({ id: householdStoresTable.id }).from(householdStoresTable).where(and(
      eq(householdStoresTable.householdId, property.householdId),
      eq(householdStoresTable.isDefault, true),
    )).limit(1);

    const [list] = await db
      .insert(groceryListsTable)
      .values({ name, propertyId: propertyIdNum, storeId: defaultStore?.id ?? null })
      .returning();

    const [prop] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, list.propertyId));

    res.status(201).json({
      id: String(list.id),
      name: list.name,
      propertyId: String(list.propertyId),
      propertyName: prop?.name ?? "",
      storeId: list.storeId === null ? null : String(list.storeId),
      itemCount: 0,
      checkedCount: 0,
      createdAt: list.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create grocery list");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/grocery-lists/:id/store", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    const storeId = Number(req.body?.storeId);
    if (!Number.isInteger(listId) || !Number.isInteger(storeId)) {
      res.status(400).json({ error: "list id and storeId must be valid ids" });
      return;
    }
    const [record] = await db.select({
      list: groceryListsTable,
      propertyName: propertiesTable.name,
      propertyHouseholdId: propertiesTable.householdId,
    }).from(groceryListsTable)
      .innerJoin(propertiesTable, eq(groceryListsTable.propertyId, propertiesTable.id))
      .where(eq(groceryListsTable.id, listId))
      .limit(1);
    if (!record || !scope.propertyIds.includes(record.list.propertyId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [store] = await db.select().from(householdStoresTable)
      .where(eq(householdStoresTable.id, storeId))
      .limit(1);
    if (!store || !canAssignStoreToList(
      record.list.propertyId,
      scope.propertyIds,
      record.propertyHouseholdId,
      store.householdId,
    )) {
      res.status(404).json({ error: "Store not found in the grocery list household" });
      return;
    }
    const [updated] = await db.update(groceryListsTable)
      .set({ storeId })
      .where(eq(groceryListsTable.id, listId))
      .returning();
    const [{ itemCount, checkedCount }] = await db.select({
      itemCount: sql<number>`count(${groceryItemsTable.id})::int`,
      checkedCount: sql<number>`count(case when ${groceryItemsTable.checked} = true then 1 end)::int`,
    }).from(groceryItemsTable).where(eq(groceryItemsTable.listId, listId));
    res.json({
      id: String(updated.id),
      name: updated.name,
      propertyId: String(updated.propertyId),
      propertyName: record.propertyName,
      storeId: String(updated.storeId),
      itemCount,
      checkedCount,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to select grocery list store");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/grocery-lists/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: "Invalid list id" });
      return;
    }

    const [list] = await db
      .select()
      .from(groceryListsTable)
      .where(eq(groceryListsTable.id, listId))
      .limit(1);
    if (!list || !scope.propertyIds.includes(list.propertyId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(groceryListsTable).where(eq(groceryListsTable.id, listId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete grocery list");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/grocery-lists/:id/items", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: "Invalid list id" });
      return;
    }

    const [list] = await db
      .select()
      .from(groceryListsTable)
      .where(eq(groceryListsTable.id, listId))
      .limit(1);
    if (!list || !scope.propertyIds.includes(list.propertyId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const items = await db
      .select()
      .from(groceryItemsTable)
      .where(eq(groceryItemsTable.listId, listId))
      .orderBy(groceryItemsTable.createdAt);

    res.json(
      items.map((i) => ({
        id: String(i.id),
        listId: String(i.listId),
        name: i.name,
        quantity: i.quantity ?? null,
        category: i.category ?? null,
        checked: i.checked,
        addedBy: i.addedBy ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get grocery items");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/grocery-lists/:id/items", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: "Invalid list id" });
      return;
    }
    const { name, quantity, category, addedBy } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name required" });
      return;
    }
    const trimmedName = name.trim();

    const [list] = await db
      .select()
      .from(groceryListsTable)
      .where(eq(groceryListsTable.id, listId))
      .limit(1);
    if (!list || !scope.propertyIds.includes(list.propertyId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // A transaction-scoped PostgreSQL advisory lock serializes only additions
    // to this list. It avoids cross-list contention while ensuring repeated or
    // concurrent recipe imports cannot both pass the duplicate lookup.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${listId})`);
      const [existing] = await tx
        .select()
        .from(groceryItemsTable)
        .where(and(
          eq(groceryItemsTable.listId, listId),
          sql`lower(btrim(${groceryItemsTable.name})) = ${normalizeGroceryItemName(trimmedName)}`,
        ))
        .limit(1);
      if (existing) {
        if (!existing.checked) return { item: existing, created: false };
        const [reactivated] = await tx
          .update(groceryItemsTable)
          .set({
            checked: false,
            quantity: quantity ?? existing.quantity,
            category: category ?? existing.category,
          })
          .where(eq(groceryItemsTable.id, existing.id))
          .returning();
        return { item: reactivated, created: false };
      }

      const [item] = await tx
        .insert(groceryItemsTable)
        .values({ listId, name: trimmedName, quantity: quantity ?? null, category: category ?? null, addedBy: addedBy ?? null })
        .returning();
      return { item, created: true };
    });
    const { item } = result;

    res.status(result.created ? 201 : 200).json({
      id: String(item.id),
      listId: String(item.listId),
      name: item.name,
      quantity: item.quantity ?? null,
      category: item.category ?? null,
      checked: item.checked,
      addedBy: item.addedBy ?? null,
      createdAt: item.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to add grocery item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/grocery-items/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid item id" });
      return;
    }
    const { name, quantity, category, checked } = req.body;

    const [existing] = await db
      .select({ item: groceryItemsTable, propertyId: groceryListsTable.propertyId })
      .from(groceryItemsTable)
      .innerJoin(groceryListsTable, eq(groceryItemsTable.listId, groceryListsTable.id))
      .where(eq(groceryItemsTable.id, id))
      .limit(1);
    if (!existing || !scope.propertyIds.includes(existing.propertyId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db
      .update(groceryItemsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(quantity !== undefined && { quantity: quantity ?? null }),
        ...(category !== undefined && { category: category ?? null }),
        ...(checked !== undefined && { checked }),
      })
      .where(eq(groceryItemsTable.id, id));

    const [item] = await db.select().from(groceryItemsTable).where(eq(groceryItemsTable.id, id));
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      id: String(item.id),
      listId: String(item.listId),
      name: item.name,
      quantity: item.quantity ?? null,
      category: item.category ?? null,
      checked: item.checked,
      addedBy: item.addedBy ?? null,
      createdAt: item.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update grocery item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/grocery-items/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid item id" });
      return;
    }

    const [existing] = await db
      .select({ item: groceryItemsTable, propertyId: groceryListsTable.propertyId })
      .from(groceryItemsTable)
      .innerJoin(groceryListsTable, eq(groceryItemsTable.listId, groceryListsTable.id))
      .where(eq(groceryItemsTable.id, id))
      .limit(1);
    if (!existing || !scope.propertyIds.includes(existing.propertyId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(groceryItemsTable).where(eq(groceryItemsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete grocery item");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
