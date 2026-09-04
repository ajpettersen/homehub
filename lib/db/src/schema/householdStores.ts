import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { householdsTable } from "./households";

export const GROCERY_CATEGORY_KEYS = [
  "produce",
  "deli",
  "meat",
  "dairy",
  "bread",
  "grains",
  "canned",
  "snacks",
  "frozen",
  "beverages",
  "household",
  "other",
] as const;

export type GroceryCategoryKey = (typeof GROCERY_CATEGORY_KEYS)[number];

export const householdStoresTable = pgTable(
  "household_stores",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    notes: text("notes"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("household_stores_one_default")
      .on(table.householdId)
      .where(sql`${table.isDefault} = true`),
  ],
);

export const storeDepartmentsTable = pgTable(
  "store_departments",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => householdStoresTable.id, { onDelete: "cascade" }),
    categoryKey: text("category_key").$type<GroceryCategoryKey>().notNull(),
    displayName: text("display_name").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  table => [
    uniqueIndex("store_departments_store_category_unique").on(table.storeId, table.categoryKey),
    uniqueIndex("store_departments_store_order_unique").on(table.storeId, table.sortOrder),
    check("store_departments_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
    check("store_departments_category_key_check", sql`${table.categoryKey} IN ('produce', 'deli', 'meat', 'dairy', 'bread', 'grains', 'canned', 'snacks', 'frozen', 'beverages', 'household', 'other')`),
  ],
);

export type HouseholdStore = typeof householdStoresTable.$inferSelect;
export type StoreDepartment = typeof storeDepartmentsTable.$inferSelect;