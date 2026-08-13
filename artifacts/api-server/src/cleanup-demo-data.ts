/**
 * One-time cleanup: remove seeded demo data so the app starts fresh.
 * Keeps: family members, properties, maintenance tasks.
 * Removes: chores, meal plans, grocery lists/items, todo lists/items,
 *          and the "Cleaner" demo family member.
 */
import { db } from "@workspace/db";
import {
  choresTable,
  mealPlansTable,
  groceryItemsTable,
  groceryListsTable,
  todoItemsTable,
  todoListsTable,
  familyMembersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Cleaning demo data...");

  await db.delete(choresTable);
  console.log("  ✓ Chores cleared");

  await db.delete(mealPlansTable);
  console.log("  ✓ Meal plans cleared");

  await db.delete(groceryItemsTable);
  console.log("  ✓ Grocery items cleared");

  await db.delete(groceryListsTable);
  console.log("  ✓ Grocery lists cleared");

  try {
    await db.delete(todoItemsTable);
    console.log("  ✓ Todo items cleared");
    await db.delete(todoListsTable);
    console.log("  ✓ Todo lists cleared");
  } catch {
    console.log("  (todo tables not found, skipping)");
  }

  // Remove the "Cleaner" demo member
  await db.delete(familyMembersTable).where(eq(familyMembersTable.name, "Cleaner"));
  console.log("  ✓ Cleaner demo member removed");

  console.log("Done! Database is clean.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
