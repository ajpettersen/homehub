import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import type { GroceryCategoryKey } from "./householdStores";

export const kitchenInventoryItemsTable = pgTable("kitchen_inventory_items", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  categoryKey: text("category_key").$type<GroceryCategoryKey>().notNull().default("other"),
  quantity: text("quantity"),
  sourceType: text("source_type").notNull().default("manual"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("kitchen_inventory_property_name_unique").on(table.propertyId, table.normalizedName),
  index("kitchen_inventory_property_category_idx").on(table.propertyId, table.categoryKey),
  check("kitchen_inventory_category_check", sql`${table.categoryKey} IN ('produce', 'deli', 'meat', 'dairy', 'bread', 'grains', 'canned', 'snacks', 'frozen', 'beverages', 'household', 'other')`),
  check("kitchen_inventory_source_check", sql`${table.sourceType} IN ('photo', 'manual')`),
]);

export type KitchenInventoryItem = typeof kitchenInventoryItemsTable.$inferSelect;