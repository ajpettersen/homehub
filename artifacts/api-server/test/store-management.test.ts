import assert from "node:assert/strict";
import { GROCERY_CATEGORY_KEYS } from "@workspace/db";
import { canAssignStoreToList } from "../src/routes/grocery";
import {
  deterministicPromotionId,
  deterministicReplacementStoreId,
  normalizeStorePayload,
} from "../src/routes/stores";
import { GROCERY_CATALOG_SEED } from "../src/lib/groceryCatalog";

const departments = GROCERY_CATEGORY_KEYS.map(categoryKey => ({
  categoryKey,
  displayName: ` ${categoryKey.toUpperCase()} `,
}));

const normalized = normalizeStorePayload({
  name: "  Neighborhood Market  ",
  address: "  12 Main Street  ",
  notes: "   ",
  isDefault: true,
  departments,
});
assert.equal(normalized.name, "Neighborhood Market");
assert.equal(normalized.address, "12 Main Street");
assert.equal(normalized.notes, null);
assert.deepEqual(normalized.departments.map(department => department.categoryKey), [...GROCERY_CATEGORY_KEYS]);
assert.equal(normalized.departments[0]?.displayName, "PRODUCE");

assert.throws(
  () => normalizeStorePayload({
    name: "Store",
    isDefault: false,
    departments: departments.slice(0, -1),
  }),
  /exactly 12 categories/,
);
assert.throws(
  () => normalizeStorePayload({
    name: "Store",
    isDefault: false,
    departments: departments.map((department, index) => index === 1
      ? { ...department, categoryKey: GROCERY_CATEGORY_KEYS[0] }
      : department),
  }),
  /every canonical category exactly once/,
);

assert.equal(deterministicPromotionId([9, 3, 7]), 3);
assert.equal(deterministicPromotionId([]), null);
assert.equal(
  deterministicReplacementStoreId([
    { id: 9, isDefault: false },
    { id: 3, isDefault: true },
    { id: 7, isDefault: false },
  ], 9),
  3,
  "deleting a non-default preserves the remaining default for reassignment",
);
assert.equal(
  deterministicReplacementStoreId([
    { id: 9, isDefault: true },
    { id: 3, isDefault: false },
    { id: 7, isDefault: false },
  ], 9),
  3,
  "deleting the default promotes the lowest-id remaining store before reassignment",
);

assert.equal(canAssignStoreToList(4, [4, 5], 20, 20), true);
assert.equal(canAssignStoreToList(4, [5], 20, 20), false, "the list must be in property scope");
assert.equal(canAssignStoreToList(4, [4], 20, 21), false, "cross-household stores are rejected");
assert.equal(canAssignStoreToList(4, [4], null, 20), false, "ambiguous legacy property ownership is rejected");

assert.ok(GROCERY_CATALOG_SEED.length >= 300, "the shared catalog should cover a broad set of common store items");
assert.equal(new Set(GROCERY_CATALOG_SEED.map(item => item.normalizedName)).size, GROCERY_CATALOG_SEED.length);
assert.deepEqual(
  new Set(GROCERY_CATALOG_SEED.map(item => item.categoryKey)),
  new Set(GROCERY_CATEGORY_KEYS),
  "the catalog should cover every store department",
);

console.log("Store normalization, category, promotion, and authorization tests passed");