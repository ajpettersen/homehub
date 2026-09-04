import {
  choresTable,
  contractorsTable,
  groceryListsTable,
  maintenanceTasksTable,
  mealPlansTable,
  peopleTable,
  recipesTable,
  todoListsTable,
  userProfilesTable,
} from "@workspace/db";
import { count, eq } from "drizzle-orm";

export const PROPERTY_DEPENDENCY_LABELS = [
  "chores",
  "maintenanceTasks",
  "groceryLists",
  "mealPlans",
  "recipes",
  "todoLists",
  "people",
  "contractors",
  "allowedUserProfiles",
] as const;

export type PropertyDependencyCounts = Record<
  (typeof PROPERTY_DEPENDENCY_LABELS)[number],
  number
>;

type QueryableTransaction = {
  select: (...args: any[]) => any;
};

/**
 * Counts every schema-level property reference. Keep this list in sync with
 * foreign keys to propertiesTable; deletion must never depend on FK cascades.
 */
export async function getPropertyDependencyCounts(
  tx: QueryableTransaction,
  propertyId: number,
): Promise<PropertyDependencyCounts> {
  const queries = [
    tx.select({ count: count(choresTable.id) }).from(choresTable).where(eq(choresTable.propertyId, propertyId)),
    tx.select({ count: count(maintenanceTasksTable.id) }).from(maintenanceTasksTable).where(eq(maintenanceTasksTable.propertyId, propertyId)),
    tx.select({ count: count(groceryListsTable.id) }).from(groceryListsTable).where(eq(groceryListsTable.propertyId, propertyId)),
    tx.select({ count: count(mealPlansTable.id) }).from(mealPlansTable).where(eq(mealPlansTable.propertyId, propertyId)),
    tx.select({ count: count(recipesTable.id) }).from(recipesTable).where(eq(recipesTable.propertyId, propertyId)),
    tx.select({ count: count(todoListsTable.id) }).from(todoListsTable).where(eq(todoListsTable.propertyId, propertyId)),
    tx.select({ count: count(peopleTable.id) }).from(peopleTable).where(eq(peopleTable.propertyId, propertyId)),
    tx.select({ count: count(contractorsTable.id) }).from(contractorsTable).where(eq(contractorsTable.propertyId, propertyId)),
    tx.select({ count: count(userProfilesTable.id) }).from(userProfilesTable).where(eq(userProfilesTable.allowedPropertyId, propertyId)),
  ];
  const results = await Promise.all(queries);
  return Object.fromEntries(
    PROPERTY_DEPENDENCY_LABELS.map((label, index) => [
      label,
      Number(results[index][0]?.count ?? 0),
    ]),
  ) as PropertyDependencyCounts;
}

export function totalPropertyDependencies(counts: PropertyDependencyCounts): number {
  return PROPERTY_DEPENDENCY_LABELS.reduce((total, label) => total + counts[label], 0);
}

export function classifyLockedPropertySet(
  targetFoundInHousehold: boolean,
  householdPropertyCount: number,
): "missing" | "last" | "check-dependencies" {
  if (!targetFoundInHousehold) return "missing";
  if (householdPropertyCount <= 1) return "last";
  return "check-dependencies";
}