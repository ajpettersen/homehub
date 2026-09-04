import { canonicalizeMaintenanceTitle } from "./maintenanceCanonicalization";

export const MAINTENANCE_CATALOG = [
  { key: "hvac-filter", title: "Replace HVAC filter", category: "filter", frequencyDays: 90, aliases: ["change furnace filter", "replace air conditioner filter", "change ac filter", "replace air filter"] },
  { key: "smoke-co-detector-test", title: "Test smoke and carbon monoxide detectors", category: "seasonal", frequencyDays: 180, aliases: ["test smoke detectors", "test co detectors", "test carbon monoxide detector"] },
  { key: "water-heater-flush", title: "Flush water heater", category: "water", frequencyDays: 365, aliases: ["water heater flush", "flush the water heater"] },
  { key: "dryer-vent-cleaning", title: "Clean dryer vent", category: "cleaning", frequencyDays: 365, aliases: ["dryer vent cleaning", "clean lint vent"] },
  { key: "gutter-cleaning", title: "Clean gutters", category: "yard", frequencyDays: 180, aliases: ["gutter cleaning", "clear gutters"] },
  { key: "refrigerator-filter", title: "Replace refrigerator water filter", category: "filter", frequencyDays: 180, aliases: ["replace fridge water filter", "change refrigerator filter", "change fridge filter"] },
  { key: "refrigerator-coils", title: "Clean refrigerator coils", category: "appliance", frequencyDays: 365, aliases: ["clean fridge coils", "refrigerator coil cleaning"] },
  { key: "pest-inspection", title: "Schedule pest inspection", category: "seasonal", frequencyDays: 365, aliases: ["pest control inspection", "pest inspection"] },
  { key: "seasonal-hvac-service", title: "Schedule seasonal HVAC service", category: "seasonal", frequencyDays: 180, aliases: ["hvac tune up", "air conditioner service", "furnace service", "seasonal hvac maintenance"] },
  { key: "fire-extinguisher-check", title: "Check fire extinguishers", category: "seasonal", frequencyDays: 365, aliases: ["fire extinguisher inspection", "inspect fire extinguisher"] },
] as const;

export type MaintenanceCatalogItem = typeof MAINTENANCE_CATALOG[number];
export type MaintenanceCatalogKey = MaintenanceCatalogItem["key"];

const byKey = new Map(MAINTENANCE_CATALOG.map(item => [item.key, item]));
const titleToKey = new Map<string, MaintenanceCatalogKey>();
for (const item of MAINTENANCE_CATALOG) {
  for (const title of [item.title, ...item.aliases]) {
    titleToKey.set(canonicalizeMaintenanceTitle(title), item.key);
  }
}

export function getMaintenanceCatalogItem(key: unknown): MaintenanceCatalogItem | undefined {
  return typeof key === "string" ? byKey.get(key as MaintenanceCatalogKey) : undefined;
}

/** Returns a controlled identity only for exact catalog titles and aliases. */
export function inferMaintenanceCatalogKey(title: unknown): MaintenanceCatalogKey | undefined {
  return typeof title === "string" ? titleToKey.get(canonicalizeMaintenanceTitle(title)) : undefined;
}