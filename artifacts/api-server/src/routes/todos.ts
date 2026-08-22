import { Router } from "express";
import { db } from "@workspace/db";
import { todoListsTable, todoItemsTable, familyMembersTable, propertiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

router.get("/todo-lists", async (req, res) => {
  try {
    const rows = await db
      .select({
        list: todoListsTable,
        assigneeName: familyMembersTable.name,
        propertyName: propertiesTable.name,
        itemCount: sql<number>`count(${todoItemsTable.id})::int`,
        completedCount: sql<number>`count(case when ${todoItemsTable.completed} = true then 1 end)::int`,
      })
      .from(todoListsTable)
      .leftJoin(familyMembersTable, eq(todoListsTable.assigneeId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(todoListsTable.propertyId, propertiesTable.id))
      .leftJoin(todoItemsTable, eq(todoItemsTable.listId, todoListsTable.id))
      .groupBy(todoListsTable.id, familyMembersTable.name, propertiesTable.name)
      .orderBy(todoListsTable.id);

    res.json(
      rows.map((r) => ({
        id: String(r.list.id),
        name: r.list.name,
        assigneeId: r.list.assigneeId ? String(r.list.assigneeId) : null,
        assigneeName: r.assigneeName ?? null,
        propertyId: r.list.propertyId ? String(r.list.propertyId) : null,
        propertyName: r.propertyName ?? null,
        itemCount: r.itemCount,
        completedCount: r.completedCount,
        createdAt: r.list.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get todo lists");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/todo-lists", async (req, res) => {
  try {
    const { name, assigneeId, propertyId } = req.body;
    if (!name) {
      res.status(400).json({ error: "name required" });
      return;
    }

    const [list] = await db
      .insert(todoListsTable)
      .values({
        name,
        assigneeId: assigneeId ? Number(assigneeId) : null,
        propertyId: propertyId ? Number(propertyId) : null,
      })
      .returning();

    res.status(201).json({
      id: String(list.id),
      name: list.name,
      assigneeId: list.assigneeId ? String(list.assigneeId) : null,
      assigneeName: null,
      propertyId: list.propertyId ? String(list.propertyId) : null,
      propertyName: null,
      itemCount: 0,
      completedCount: 0,
      createdAt: list.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create todo list");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/todo-lists/:id", async (req, res) => {
  try {
    await db.delete(todoListsTable).where(eq(todoListsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete todo list");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/todo-lists/:id/items", async (req, res) => {
  try {
    const rows = await db
      .select({
        item: todoItemsTable,
        assigneeName: familyMembersTable.name,
      })
      .from(todoItemsTable)
      .leftJoin(familyMembersTable, eq(todoItemsTable.assigneeId, familyMembersTable.id))
      .where(eq(todoItemsTable.listId, Number(req.params.id)))
      .orderBy(todoItemsTable.createdAt);

    res.json(
      rows.map((r) => ({
        id: String(r.item.id),
        listId: String(r.item.listId),
        content: r.item.content,
        completed: r.item.completed,
        dueDate: r.item.dueDate ?? null,
        assigneeId: r.item.assigneeId ? String(r.item.assigneeId) : null,
        assigneeName: r.assigneeName ?? null,
        createdAt: r.item.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get todo items");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/todo-lists/:id/items", async (req, res) => {
  try {
    const listId = Number(req.params.id);
    const { content, dueDate, assigneeId } = req.body;
    if (!content) {
      res.status(400).json({ error: "content required" });
      return;
    }

    const [item] = await db
      .insert(todoItemsTable)
      .values({
        listId,
        content,
        dueDate: dueDate ?? null,
        assigneeId: assigneeId ? Number(assigneeId) : null,
      })
      .returning();

    res.status(201).json({
      id: String(item.id),
      listId: String(item.listId),
      content: item.content,
      completed: item.completed,
      dueDate: item.dueDate ?? null,
      assigneeId: item.assigneeId ? String(item.assigneeId) : null,
      assigneeName: null,
      createdAt: item.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to add todo item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/todo-items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { content, completed, dueDate, assigneeId } = req.body;

    await db
      .update(todoItemsTable)
      .set({
        ...(content !== undefined && { content }),
        ...(completed !== undefined && { completed }),
        ...(dueDate !== undefined && { dueDate: dueDate ?? null }),
        ...(assigneeId !== undefined && { assigneeId: assigneeId ? Number(assigneeId) : null }),
      })
      .where(eq(todoItemsTable.id, id));

    const rows = await db
      .select({ item: todoItemsTable, assigneeName: familyMembersTable.name })
      .from(todoItemsTable)
      .leftJoin(familyMembersTable, eq(todoItemsTable.assigneeId, familyMembersTable.id))
      .where(eq(todoItemsTable.id, id));

    if (!rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const r = rows[0];

    res.json({
      id: String(r.item.id),
      listId: String(r.item.listId),
      content: r.item.content,
      completed: r.item.completed,
      dueDate: r.item.dueDate ?? null,
      assigneeId: r.item.assigneeId ? String(r.item.assigneeId) : null,
      assigneeName: r.assigneeName ?? null,
      createdAt: r.item.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update todo item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/todo-items/:id", async (req, res) => {
  try {
    await db.delete(todoItemsTable).where(eq(todoItemsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete todo item");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
