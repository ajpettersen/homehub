import assert from "node:assert/strict";
import type { PropertyAuthorizationScope } from "../src/lib/propertyAuthorization";
import { isApprovedLinkedAdultScope } from "../src/middlewares/requireApprovedHousehold";
import {
  classifyLockedPropertySet,
  PROPERTY_DEPENDENCY_LABELS,
  totalPropertyDependencies,
  type PropertyDependencyCounts,
} from "../src/lib/propertyDeletion";

const scope = (
  overrides: Partial<PropertyAuthorizationScope> = {},
): PropertyAuthorizationScope => ({
  clerkId: "account",
  householdId: 10,
  propertyIds: [1, 2],
  role: "family",
  isAdmin: false,
  linkedFamilyMemberId: 20,
  ...overrides,
});

assert.equal(isApprovedLinkedAdultScope(scope()), true, "linked non-admin adults can manage properties");
assert.equal(isApprovedLinkedAdultScope(scope({ linkedFamilyMemberId: null })), false, "unlinked accounts are denied");
assert.equal(isApprovedLinkedAdultScope(scope({ role: "cleaner", linkedFamilyMemberId: null })), false, "cleaners are denied");
assert.equal(classifyLockedPropertySet(false, 2), "missing", "missing and cross-household targets are hidden");
assert.equal(classifyLockedPropertySet(true, 1), "last", "the final property is retained");
assert.equal(classifyLockedPropertySet(true, 2), "check-dependencies", "non-final properties proceed to dependency checks");

const expectedCategories = [
  "chores",
  "maintenanceTasks",
  "groceryLists",
  "mealPlans",
  "recipes",
  "todoLists",
  "people",
  "contractors",
  "allowedUserProfiles",
];
assert.deepEqual(PROPERTY_DEPENDENCY_LABELS, expectedCategories);

for (const category of PROPERTY_DEPENDENCY_LABELS) {
  const counts = Object.fromEntries(
    PROPERTY_DEPENDENCY_LABELS.map(label => [label, label === category ? 1 : 0]),
  ) as PropertyDependencyCounts;
  assert.equal(totalPropertyDependencies(counts), 1, `${category} blocks deletion`);
}

const noDependencies = Object.fromEntries(
  PROPERTY_DEPENDENCY_LABELS.map(label => [label, 0]),
) as PropertyDependencyCounts;
assert.equal(totalPropertyDependencies(noDependencies), 0, "a reference-free property can pass the dependency guard");

console.log("Property management authorization and dependency tests passed");