import { sql } from "drizzle-orm";
import { check, index, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { type GroceryCategoryKey } from "./householdStores";

export const groceryCatalogItemsTable = pgTable(
  "grocery_catalog_items",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    categoryKey: text("category_key").$type<GroceryCategoryKey>().notNull(),
    searchTerms: text("search_terms").notNull(),
  },
  table => [
    uniqueIndex("grocery_catalog_items_normalized_name_unique").on(table.normalizedName),
    index("grocery_catalog_items_category_name_idx").on(table.categoryKey, table.name),
    check(
      "grocery_catalog_items_category_key_check",
      sql`${table.categoryKey} IN ('produce', 'deli', 'meat', 'dairy', 'bread', 'grains', 'canned', 'snacks', 'frozen', 'beverages', 'household', 'other')`,
    ),
  ],
);

export type GroceryCatalogItem = typeof groceryCatalogItemsTable.$inferSelect;