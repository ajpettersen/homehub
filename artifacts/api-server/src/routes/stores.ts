import { Router } from "express";
import {
  db,
  GROCERY_CATEGORY_KEYS,
  groceryListsTable,
  householdStoresTable,
  storeDepartmentsTable,
} from "@workspace/db";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  getApprovedHouseholdScope,
  requireApprovedLinkedAdult,
} from "../middlewares/requireApprovedHousehold";

const router = Router();
const NAME_MAX = 120;
const ADDRESS_MAX = 300;
const NOTES_MAX = 1000;
const DEPARTMENT_NAME_MAX = 80;

type DepartmentInput = { categoryKey: string; displayName: string };
class StoreValidationError extends Error {}
export type NormalizedStoreInput = {
  name: string;
  address: string | null;
  notes: string | null;
  isDefault: boolean;
  departments: DepartmentInput[];
};

export function normalizeStorePayload(value: unknown): NormalizedStoreInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StoreValidationError("Invalid store payload");
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > NAME_MAX) throw new StoreValidationError(`name must be between 1 and ${NAME_MAX} characters`);
  const optionalText = (field: string, max: number): string | null => {
    const raw = input[field];
    if (raw === undefined || raw === null || raw === "") return null;
    if (typeof raw !== "string") throw new StoreValidationError(`${field} must be a string`);
    const normalized = raw.trim();
    if (!normalized) return null;
    if (normalized.length > max) throw new StoreValidationError(`${field} must be at most ${max} characters`);
    return normalized;
  };
  if (typeof input.isDefault !== "boolean") throw new StoreValidationError("isDefault must be a boolean");
  if (!Array.isArray(input.departments) || input.departments.length !== GROCERY_CATEGORY_KEYS.length) {
    throw new StoreValidationError(`departments must contain exactly ${GROCERY_CATEGORY_KEYS.length} categories`);
  }
  const departments = input.departments.map((raw): DepartmentInput => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new StoreValidationError("Invalid department");
    const department = raw as Record<string, unknown>;
    const categoryKey = typeof department.categoryKey === "string" ? department.categoryKey.trim() : "";
    const displayName = typeof department.displayName === "string" ? department.displayName.trim() : "";
    if (!displayName || displayName.length > DEPARTMENT_NAME_MAX) {
      throw new StoreValidationError(`department displayName must be between 1 and ${DEPARTMENT_NAME_MAX} characters`);
    }
    return { categoryKey, displayName };
  });
  const keys = departments.map(department => department.categoryKey);
  if (new Set(keys).size !== GROCERY_CATEGORY_KEYS.length
    || GROCERY_CATEGORY_KEYS.some(category => !keys.includes(category))) {
    throw new StoreValidationError("departments must include every canonical category exactly once");
  }
  return {
    name,
    address: optionalText("address", ADDRESS_MAX),
    notes: optionalText("notes", NOTES_MAX),
    isDefault: input.isDefault,
    departments,
  };
}

export function deterministicPromotionId(ids: number[]): number | null {
  return ids.length === 0 ? null : Math.min(...ids);
}

export function deterministicReplacementStoreId(
  stores: Array<{ id: number; isDefault: boolean }>,
  deletedStoreId: number,
): number | null {
  const remaining = stores.filter(store => store.id !== deletedStoreId);
  return remaining.find(store => store.isDefault)?.id
    ?? deterministicPromotionId(remaining.map(store => store.id));
}

async function serializeStore(storeId: number) {
  const [store] = await db.select().from(householdStoresTable).where(eq(householdStoresTable.id, storeId)).limit(1);
  if (!store) return null;
  const departments = await db.select().from(storeDepartmentsTable)
    .where(eq(storeDepartmentsTable.storeId, store.id))
    .orderBy(asc(storeDepartmentsTable.sortOrder));
  return {
    id: String(store.id),
    name: store.name,
    address: store.address,
    notes: store.notes,
    isDefault: store.isDefault,
    departments: departments.map(department => ({
      categoryKey: department.categoryKey,
      displayName: department.displayName,
      sortOrder: department.sortOrder,
    })),
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

router.get("/stores", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const stores = await db.select().from(householdStoresTable)
      .where(eq(householdStoresTable.householdId, scope.householdId))
      .orderBy(sql`${householdStoresTable.isDefault} desc`, asc(householdStoresTable.id));
    const result = await Promise.all(stores.map(store => serializeStore(store.id)));
    res.json(result.filter(store => store !== null));
  } catch (err) {
    req.log.error({ err }, "Failed to get stores");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/stores", async (req, res) => {
  const scope = requireApprovedLinkedAdult(res);
  if (!scope) return;
  try {
    const input = normalizeStorePayload(req.body);
    const storeId = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`household-stores:${scope.householdId}`}))`);
      const existing = await tx.select({ id: householdStoresTable.id }).from(householdStoresTable)
        .where(eq(householdStoresTable.householdId, scope.householdId));
      const makeDefault = input.isDefault || existing.length === 0;
      if (makeDefault) {
        await tx.update(householdStoresTable).set({ isDefault: false })
          .where(eq(householdStoresTable.householdId, scope.householdId));
      }
      const [store] = await tx.insert(householdStoresTable).values({
        householdId: scope.householdId,
        name: input.name,
        address: input.address,
        notes: input.notes,
        isDefault: makeDefault,
      }).returning({ id: householdStoresTable.id });
      await tx.insert(storeDepartmentsTable).values(input.departments.map((department, sortOrder) => ({
        storeId: store.id,
        categoryKey: department.categoryKey as (typeof GROCERY_CATEGORY_KEYS)[number],
        displayName: department.displayName,
        sortOrder,
      })));
      return store.id;
    });
    res.status(201).json(await serializeStore(storeId));
  } catch (err) {
    if (err instanceof StoreValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Failed to create store");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/stores/:id", async (req, res) => {
  const scope = requireApprovedLinkedAdult(res);
  if (!scope) return;
  const storeId = Number(req.params.id);
  if (!Number.isInteger(storeId)) {
    res.status(400).json({ error: "Invalid store id" });
    return;
  }
  try {
    const input = normalizeStorePayload(req.body);
    const found = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`household-stores:${scope.householdId}`}))`);
      const [store] = await tx.select().from(householdStoresTable).where(and(
        eq(householdStoresTable.id, storeId),
        eq(householdStoresTable.householdId, scope.householdId),
      )).limit(1);
      if (!store) return false;

      if (input.isDefault) {
        await tx.update(householdStoresTable).set({ isDefault: false }).where(and(
          eq(householdStoresTable.householdId, scope.householdId),
          ne(householdStoresTable.id, storeId),
        ));
      } else if (store.isDefault) {
        const alternatives = await tx.select({ id: householdStoresTable.id }).from(householdStoresTable)
          .where(and(eq(householdStoresTable.householdId, scope.householdId), ne(householdStoresTable.id, storeId)))
          .orderBy(asc(householdStoresTable.id));
        const promotionId = deterministicPromotionId(alternatives.map(candidate => candidate.id));
        if (promotionId === null) input.isDefault = true;
        else {
          await tx.update(householdStoresTable).set({ isDefault: false }).where(eq(householdStoresTable.id, storeId));
          await tx.update(householdStoresTable).set({ isDefault: true }).where(eq(householdStoresTable.id, promotionId));
        }
      }
      await tx.update(householdStoresTable).set({
        name: input.name,
        address: input.address,
        notes: input.notes,
        isDefault: input.isDefault,
        updatedAt: sql`now()`,
      }).where(eq(householdStoresTable.id, storeId));
      await tx.delete(storeDepartmentsTable).where(eq(storeDepartmentsTable.storeId, storeId));
      await tx.insert(storeDepartmentsTable).values(input.departments.map((department, sortOrder) => ({
        storeId,
        categoryKey: department.categoryKey as (typeof GROCERY_CATEGORY_KEYS)[number],
        displayName: department.displayName,
        sortOrder,
      })));
      return true;
    });
    if (!found) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(await serializeStore(storeId));
  } catch (err) {
    if (err instanceof StoreValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Failed to update store");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/stores/:id", async (req, res) => {
  const scope = requireApprovedLinkedAdult(res);
  if (!scope) return;
  const storeId = Number(req.params.id);
  if (!Number.isInteger(storeId)) {
    res.status(400).json({ error: "Invalid store id" });
    return;
  }
  try {
    const outcome = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`household-stores:${scope.householdId}`}))`);
      const stores = await tx.select().from(householdStoresTable)
        .where(eq(householdStoresTable.householdId, scope.householdId))
        .orderBy(asc(householdStoresTable.id));
      const target = stores.find(store => store.id === storeId);
      if (!target) return "missing";
      if (stores.length === 1) return "final";
      const replacementStoreId = deterministicReplacementStoreId(stores, storeId);
      if (replacementStoreId === null) throw new Error("No replacement store found");
      const remainingDefault = stores.some(store => store.id !== storeId && store.isDefault);
      if (!remainingDefault) {
        // Clear the partial unique index before promoting the deterministic
        // replacement, while keeping all list references valid below.
        if (target.isDefault) {
          await tx.update(householdStoresTable).set({ isDefault: false })
            .where(eq(householdStoresTable.id, storeId));
        }
        await tx.update(householdStoresTable).set({ isDefault: true })
          .where(eq(householdStoresTable.id, replacementStoreId));
      }
      // Do this before deleting so the FK never nulls an intentional list
      // selection. The household-scoped lock makes this durable against
      // concurrent store/default changes.
      await tx.update(groceryListsTable).set({ storeId: replacementStoreId })
        .where(eq(groceryListsTable.storeId, storeId));
      await tx.delete(householdStoresTable).where(eq(householdStoresTable.id, storeId));
      return "deleted";
    });
    if (outcome === "missing") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (outcome === "final") {
      res.status(409).json({ error: "The final household store cannot be deleted" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete store");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;