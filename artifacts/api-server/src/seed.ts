import { db } from "@workspace/db";
import {
  familyMembersTable,
  propertiesTable,
  maintenanceTasksTable,
  groceryListsTable,
  todoListsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./lib/logger";

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split("T")[0];
}

export async function seedIfEmpty() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(familyMembersTable);

    if (count > 0) return;

    logger.info("Seeding database with initial data...");

    // Family members
    const [aj, emily, holden, brody, daphne] = await db
      .insert(familyMembersTable)
      .values([
        { name: "AJ", role: "parent", color: "#2D6A4F", avatarInitials: "AJ" },
        { name: "Emily", role: "parent", color: "#E76F51", avatarInitials: "EM" },
        { name: "Holden", role: "child", color: "#457B9D", avatarInitials: "HO" },
        { name: "Brody", role: "child", color: "#E9C46A", avatarInitials: "BR" },
        { name: "Daphne", role: "child", color: "#A8DADC", avatarInitials: "DA" },
        { name: "Willa", role: "pet", color: "#BC6C25", avatarInitials: "WI" },
      ])
      .returning();

    // Properties
    const [house, cabin] = await db
      .insert(propertiesTable)
      .values([
        { name: "Main House", type: "house", icon: "home" },
        { name: "Cabin", type: "cabin", icon: "triangle" },
      ])
      .returning();

    const today = new Date();

    // Maintenance tasks for Main House
    await db.insert(maintenanceTasksTable).values([
      {
        title: "Change furnace filter",
        description: "Replace HVAC filter — check size on current filter",
        propertyId: house.id,
        category: "filter",
        frequencyDays: 30,
        nextDueDate: addDays(today, 7),
      },
      {
        title: "Check smoke & CO detector batteries",
        description: "Test all detectors and replace batteries if needed",
        propertyId: house.id,
        category: "other",
        frequencyDays: 180,
        nextDueDate: addDays(today, 90),
      },
      {
        title: "Clean dryer vent",
        description: "Remove lint buildup from dryer vent duct",
        propertyId: house.id,
        category: "appliance",
        frequencyDays: 90,
        nextDueDate: addDays(today, 45),
      },
    ]);

    // Maintenance tasks for Cabin
    await db.insert(maintenanceTasksTable).values([
      {
        title: "Change furnace filter",
        description: "Replace cabin HVAC filter",
        propertyId: cabin.id,
        category: "filter",
        frequencyDays: 30,
        nextDueDate: addDays(today, 3),
      },
      {
        title: "Treat well water",
        description: "Add well water treatment / shock chlorination",
        propertyId: cabin.id,
        category: "water",
        frequencyDays: 30,
        nextDueDate: addDays(today, 14),
      },
      {
        title: "Fill water softener salt",
        description: "Check salt level and refill as needed",
        propertyId: cabin.id,
        category: "water",
        frequencyDays: 45,
        nextDueDate: addDays(today, 10),
      },
      {
        title: "Weed control",
        description: "Spray or pull weeds around cabin perimeter and dock",
        propertyId: cabin.id,
        category: "yard",
        frequencyDays: 14,
        nextDueDate: addDays(today, 5),
      },
      {
        title: "Winterize — shut off water",
        description: "Turn off main water, drain pipes, winterize jet ski and four-wheeler, schedule pontoon pickup",
        propertyId: cabin.id,
        category: "seasonal",
        frequencyDays: 365,
        nextDueDate: "2025-10-15",
      },
      {
        title: "Spring opening",
        description: "Turn on water, de-winterize four-wheeler and jet ski, schedule pontoon launch",
        propertyId: cabin.id,
        category: "seasonal",
        frequencyDays: 365,
        nextDueDate: "2026-05-01",
      },
    ]);

    // Grocery lists
    await db.insert(groceryListsTable).values([
      { name: "Weekly Groceries", propertyId: house.id },
      { name: "Cabin Supplies", propertyId: cabin.id },
    ]);

    // To-do lists
    await db.insert(todoListsTable).values([
      { name: "Family To-Do", assigneeId: null, propertyId: null },
      { name: "House Projects", assigneeId: null, propertyId: house.id },
      { name: "Cabin Projects", assigneeId: null, propertyId: cabin.id },
    ]);

    logger.info("Database seeded successfully");
  } catch (err) {
    logger.error({ err }, "Failed to seed database");
  }
}
