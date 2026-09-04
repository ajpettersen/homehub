import { Router } from "express";
import { db } from "@workspace/db";
import { todoListsTable, todoItemsTable, familyMembersTable, propertiesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";
import type { PropertyAuthorizationScope } from "../lib/propertyAuthorization";
import { parseBulkTodoInput } from "../lib/todoBulkValidation";

const router = Router();

/**
 * Confirms a family member id belongs to the scope's household.
 * Returns true when accessible, false otherwise.
 */
async function assigneeInHousehold(
  assigneeId: number,
  scope: PropertyAuthorizationScope,
): Promise<boolean> {
  const [member] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.id, assigneeId),
      eq(familyMembersTable.householdId, scope.householdId),
    ))
    .limit(1);
  return Boolean(member);
}

router.get("/todo-lists", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);

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
      .where(eq(todoListsTable.householdId, scope.householdId))
      .groupBy(todoListsTable.id, familyMembersTable.name, propertiesTable.name)
      .orderBy(desc(todoListsTable.sortOrder), todoListsTable.id);

    const visible = rows.filter(
      (r) => r.list.propertyId === null || scope.propertyIds.includes(r.list.propertyId),
    );

    res.json(
      visible.map((r) => ({
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
    const scope = getApprovedHouseholdScope(res);
    const { name, assigneeId, propertyId } = req.body;
    if (!name) {
      res.status(400).json({ error: "name required" });
      return;
    }

    let propertyIdNum: number | null = null;
    if (propertyId !== undefined && propertyId !== null) {
      propertyIdNum = Number(propertyId);
      if (!Number.isInteger(propertyIdNum)) {
        res.status(400).json({ error: "propertyId must be a valid id" });
        return;
      }
      if (!scope.propertyIds.includes(propertyIdNum)) {
        res.status(403).json({ error: "Property not accessible" });
        return;
      }
    }

    let assigneeIdNum: number | null = null;
    if (assigneeId !== undefined && assigneeId !== null) {
      assigneeIdNum = Number(assigneeId);
      if (!Number.isInteger(assigneeIdNum)) {
        res.status(400).json({ error: "assigneeId must be a valid id" });
        return;
      }
      if (!(await assigneeInHousehold(assigneeIdNum, scope))) {
        res.status(403).json({ error: "Assignee not accessible" });
        return;
      }
    }

    const [list] = await db
      .insert(todoListsTable)
      .values({
        householdId: scope.householdId,
        name,
        assigneeId: assigneeIdNum,
        propertyId: propertyIdNum,
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

/**
 * Resolves a todo list and confirms it belongs to the scope's household and,
 * when a property is set, that the property is authorized.
 * Returns the list when accessible, otherwise null.
 */
async function resolveAccessibleList(
  listId: number,
  scope: PropertyAuthorizationScope,
): Promise<typeof todoListsTable.$inferSelect | null> {
  const [list] = await db
    .select()
    .from(todoListsTable)
    .where(eq(todoListsTable.id, listId))
    .limit(1);
  if (!list) return null;
  if (list.householdId !== scope.householdId) return null;
  if (list.propertyId !== null && !scope.propertyIds.includes(list.propertyId)) return null;
  return list;
}

router.post("/todo-lists/:id/move-to-top", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: "Invalid list id" });
      return;
    }

    const list = await resolveAccessibleList(listId, scope);
    if (!list) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Float this list above every other list in the household. Run inside a
    // transaction holding a per-household advisory lock so concurrent moves
    // allocate distinct sort orders (a bare max+1 read/write can collide).
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${"todo_list_order:" + scope.householdId}))`
      );

      const [{ maxOrder }] = await tx
        .select({ maxOrder: sql<number>`coalesce(max(${todoListsTable.sortOrder}), 0)::int` })
        .from(todoListsTable)
        .where(eq(todoListsTable.householdId, scope.householdId));

      await tx
        .update(todoListsTable)
        .set({ sortOrder: maxOrder + 1 })
        .where(eq(todoListsTable.id, listId));
    });

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to move todo list to top");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/todo-lists/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: "Invalid list id" });
      return;
    }

    const list = await resolveAccessibleList(listId, scope);
    if (!list) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(todoListsTable).where(eq(todoListsTable.id, listId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete todo list");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/todo-lists/:id/items", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: "Invalid list id" });
      return;
    }

    const list = await resolveAccessibleList(listId, scope);
    if (!list) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const rows = await db
      .select({
        item: todoItemsTable,
        assigneeName: familyMembersTable.name,
      })
      .from(todoItemsTable)
      .leftJoin(familyMembersTable, eq(todoItemsTable.assigneeId, familyMembersTable.id))
      .where(eq(todoItemsTable.listId, listId))
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
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: "Invalid list id" });
      return;
    }
    const { content, dueDate, assigneeId } = req.body;
    if (!content) {
      res.status(400).json({ error: "content required" });
      return;
    }

    const list = await resolveAccessibleList(listId, scope);
    if (!list) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let assigneeIdNum: number | null = null;
    if (assigneeId !== undefined && assigneeId !== null) {
      assigneeIdNum = Number(assigneeId);
      if (!Number.isInteger(assigneeIdNum)) {
        res.status(400).json({ error: "assigneeId must be a valid id" });
        return;
      }
      if (!(await assigneeInHousehold(assigneeIdNum, scope))) {
        res.status(403).json({ error: "Assignee not accessible" });
        return;
      }
    }

    const [item] = await db
      .insert(todoItemsTable)
      .values({
        listId,
        content,
        dueDate: dueDate ?? null,
        assigneeId: assigneeIdNum,
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

router.post("/todo-lists/:id/items/bulk", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: "Invalid list id" });
      return;
    }

    const parsed = parseBulkTodoInput(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const list = await resolveAccessibleList(listId, scope);
    if (!list) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const assigneeIds = new Set<number>();
    for (const item of parsed.data.items) {
      if (item.assigneeId !== undefined && item.assigneeId !== null) {
        const assigneeId = Number(item.assigneeId);
        if (!Number.isInteger(assigneeId)) {
          res.status(400).json({ error: "assigneeId must be a valid id" });
          return;
        }
        assigneeIds.add(assigneeId);
      }
    }
    for (const assigneeId of assigneeIds) {
      if (!(await assigneeInHousehold(assigneeId, scope))) {
        res.status(403).json({ error: "Assignee not accessible" });
        return;
      }
    }

    const items = await db.transaction(async (tx) => tx
      .insert(todoItemsTable)
      .values(parsed.data.items.map((item) => ({
        listId,
        content: item.content,
        dueDate: item.dueDate ?? parsed.data.defaultDueDate,
        // Explicit per-item null clears a list-level assignment; omitted
        // assignments inherit the list's assignee, matching list behavior.
        assigneeId: item.assigneeId === undefined
          ? list.assigneeId
          : item.assigneeId === null ? null : Number(item.assigneeId),
      })))
      .returning());

    res.status(201).json({
      items: items.map((item) => ({
        id: String(item.id),
        listId: String(item.listId),
        content: item.content,
        completed: item.completed,
        dueDate: item.dueDate ?? null,
        assigneeId: item.assigneeId ? String(item.assigneeId) : null,
        assigneeName: null,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk add todo items");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/todo-items/:id", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid item id" });
      return;
    }
    const { content, completed, dueDate, assigneeId } = req.body;

    const [existing] = await db
      .select({ item: todoItemsTable, list: todoListsTable })
      .from(todoItemsTable)
      .innerJoin(todoListsTable, eq(todoItemsTable.listId, todoListsTable.id))
      .where(eq(todoItemsTable.id, id))
      .limit(1);
    if (
      !existing ||
      existing.list.householdId !== scope.householdId ||
      (existing.list.propertyId !== null && !scope.propertyIds.includes(existing.list.propertyId))
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let assigneeIdSet: number | null | undefined;
    if (assigneeId !== undefined) {
      if (assigneeId === null) {
        assigneeIdSet = null;
      } else {
        const assigneeIdNum = Number(assigneeId);
        if (!Number.isInteger(assigneeIdNum)) {
          res.status(400).json({ error: "assigneeId must be a valid id" });
          return;
        }
        if (!(await assigneeInHousehold(assigneeIdNum, scope))) {
          res.status(403).json({ error: "Assignee not accessible" });
          return;
        }
        assigneeIdSet = assigneeIdNum;
      }
    }

    await db
      .update(todoItemsTable)
      .set({
        ...(content !== undefined && { content }),
        ...(completed !== undefined && { completed }),
        ...(dueDate !== undefined && { dueDate: dueDate ?? null }),
        ...(assigneeIdSet !== undefined && { assigneeId: assigneeIdSet }),
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
    const scope = getApprovedHouseholdScope(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid item id" });
      return;
    }

    const [existing] = await db
      .select({ item: todoItemsTable, list: todoListsTable })
      .from(todoItemsTable)
      .innerJoin(todoListsTable, eq(todoItemsTable.listId, todoListsTable.id))
      .where(eq(todoItemsTable.id, id))
      .limit(1);
    if (
      !existing ||
      existing.list.householdId !== scope.householdId ||
      (existing.list.propertyId !== null && !scope.propertyIds.includes(existing.list.propertyId))
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(todoItemsTable).where(eq(todoItemsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete todo item");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
