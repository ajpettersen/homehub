import assert from "node:assert/strict";
import {
  addMaintenanceDays,
  dateInMaintenanceTimeZone,
  getNextAnchoredMaintenanceDate,
  isDateOnly,
  resolveMaintenanceTimeZone,
} from "../src/lib/maintenanceDates";
import {
  getMaintenanceCatalogItem,
  inferMaintenanceCatalogKey,
} from "../src/lib/maintenanceCatalog";

// 00:30 UTC is still the prior calendar date in Chicago.
const boundary = new Date("2025-01-02T00:30:00.000Z");
assert.equal(dateInMaintenanceTimeZone("UTC", boundary), "2025-01-02");
assert.equal(dateInMaintenanceTimeZone("America/Chicago", boundary), "2025-01-01");
const chicagoEditDay = dateInMaintenanceTimeZone(
  "America/Chicago",
  new Date("2025-01-11T00:30:00.000Z"),
);
assert.equal(chicagoEditDay, "2025-01-10");
assert.equal(getNextAnchoredMaintenanceDate("2025-01-01", 1, chicagoEditDay), "2025-01-10");
assert.equal(addMaintenanceDays("2025-01-01", 90), "2025-04-01");
assert.equal(resolveMaintenanceTimeZone("Not/AZone"), null);
assert.equal(resolveMaintenanceTimeZone(undefined), "UTC");
assert.equal(isDateOnly("2025-02-29"), false);
assert.equal(isDateOnly("2024-02-29"), true);

assert.equal(inferMaintenanceCatalogKey("Change furnace filter"), "hvac-filter");
assert.equal(inferMaintenanceCatalogKey("Gutter cleaning"), "gutter-cleaning");
assert.equal(inferMaintenanceCatalogKey("Replace upstairs HVAC filter"), undefined);
assert.equal(getMaintenanceCatalogItem("not-a-catalog-key"), undefined);
assert.equal(getMaintenanceCatalogItem("water-heater-flush")?.title, "Flush water heater");

console.log("Maintenance dates and catalog tests passed");