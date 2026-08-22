import { Router } from "express";
import { db } from "@workspace/db";
import { groceryListsTable, groceryItemsTable, propertiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

router.get("/grocery-lists", async (req, res) => {
  try {
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
      .groupBy(groceryListsTable.id, propertiesTable.name)
      .orderBy(groceryListsTable.id);

    res.json(
      lists.map((r) => ({
        id: String(r.list.id),
        name: r.list.name,
        propertyId: String(r.list.propertyId),
        propertyName: r.propertyName ?? "",
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
    const { name, propertyId } = req.body;
    if (!name || !propertyId) {
      res.status(400).json({ error: "name and propertyId required" });
      return;
    }

    const [list] = await db
      .insert(groceryListsTable)
      .values({ name, propertyId: Number(propertyId) })
      .returning();

    const [prop] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, list.propertyId));

    res.status(201).json({
      id: String(list.id),
      name: list.name,
      propertyId: String(list.propertyId),
      propertyName: prop?.name ?? "",
      itemCount: 0,
      checkedCount: 0,
      createdAt: list.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create grocery list");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/grocery-lists/:id", async (req, res) => {
  try {
    await db.delete(groceryListsTable).where(eq(groceryListsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete grocery list");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/grocery-lists/:id/items", async (req, res) => {
  try {
    const items = await db
      .select()
      .from(groceryItemsTable)
      .where(eq(groceryItemsTable.listId, Number(req.params.id)))
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
    const listId = Number(req.params.id);
    const { name, quantity, category, addedBy } = req.body;
    if (!name) {
      res.status(400).json({ error: "name required" });
      return;
    }

    const [item] = await db
      .insert(groceryItemsTable)
      .values({ listId, name, quantity: quantity ?? null, category: category ?? null, addedBy: addedBy ?? null })
      .returning();

    res.status(201).json({
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
    const id = Number(req.params.id);
    const { name, quantity, category, checked } = req.body;

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
    await db.delete(groceryItemsTable).where(eq(groceryItemsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete grocery item");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
