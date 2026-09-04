import assert from "node:assert/strict";
import {
  canonicalizeMaintenanceTitle,
  parseIncludeCompletedQuery,
} from "../src/lib/maintenanceCanonicalization";

const hvacFilterTitles = [
  "Change HVAC filter",
  "Replace furnace filters",
  "Replace air-conditioning unit filter",
  "HVAC filter replacement",
];
for (const title of hvacFilterTitles) {
  assert.equal(
    canonicalizeMaintenanceTitle(title),
    "filter",
    `${title} canonicalizes to the common HVAC-filter task`,
  );
}

assert.notEqual(
  canonicalizeMaintenanceTitle("Replace HVAC filter"),
  canonicalizeMaintenanceTitle("Replace refrigerator water filter"),
  "different equipment remains distinct",
);
assert.notEqual(
  canonicalizeMaintenanceTitle("Replace upstairs HVAC filter"),
  canonicalizeMaintenanceTitle("Replace downstairs HVAC filter"),
  "location-qualified equipment remains distinct",
);
assert.notEqual(
  canonicalizeMaintenanceTitle("Clean air purifier filter"),
  canonicalizeMaintenanceTitle("Replace HVAC filter"),
  "unrelated air equipment is not treated as HVAC",
);

assert.deepEqual(parseIncludeCompletedQuery(undefined), { ok: true, includeCompleted: false });
assert.deepEqual(parseIncludeCompletedQuery("false"), { ok: true, includeCompleted: false });
assert.deepEqual(parseIncludeCompletedQuery("true"), { ok: true, includeCompleted: true });
assert.deepEqual(parseIncludeCompletedQuery("yes"), { ok: false });
assert.deepEqual(parseIncludeCompletedQuery(["true"]), { ok: false });

console.log("Maintenance canonicalization tests passed");