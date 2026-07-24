import { db } from "@workspace/db";
import {
  familyMembersTable,
  propertiesTable,
  maintenanceTasksTable,
  choresTable,
  groceryListsTable,
  todoListsTable,
} from "@workspace/db";
import { sql, lt, eq } from "drizzle-orm";
import { logger } from "./lib/logger";

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split("T")[0];
}

/** Advance a date string forward by frequencyDays until it's in the future */
function advanceToFuture(dateStr: string, frequencyDays: number): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (d < today) {
    d.setDate(d.getDate() + frequencyDays);
  }
  return d.toISOString().split("T")[0];
}

export async function seedIfEmpty() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(familyMembersTable);

    if (count > 0) return;

    logger.info("Seeding database with initial data...");

    // Family members
    await db
      .insert(familyMembersTable)
      .values([
        { name: "AJ", role: "parent", color: "#2D6A4F", avatarInitials: "AJ" },
        { name: "Emily", role: "parent", color: "#E76F51", avatarInitials: "EM" },
        { name: "Holden", role: "child", color: "#457B9D", avatarInitials: "HO" },
        { name: "Brody", role: "child", color: "#E9C46A", avatarInitials: "BR" },
        { name: "Daphne", role: "child", color: "#A8DADC", avatarInitials: "DA" },
        { name: "Willa", role: "pet", color: "#BC6C25", avatarInitials: "WI" },
      ]);

    // Properties
    await db
      .insert(propertiesTable)
      .values([
        { name: "Main House", type: "house", icon: "home" },
        { name: "Cabin", type: "cabin", icon: "triangle" },
      ]);

    const today = new Date();

    // Maintenance tasks for Main House
    const [house, cabin] = await db
      .select()
      .from(propertiesTable)
      .orderBy(propertiesTable.id);

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
        description:
          "Turn off main water, drain pipes, winterize jet ski and four-wheeler, schedule pontoon pickup",
        propertyId: cabin.id,
        category: "seasonal",
        frequencyDays: 365,
        nextDueDate: advanceToFuture("2025-10-15", 365),
      },
      {
        title: "Spring opening",
        description:
          "Turn on water, de-winterize four-wheeler and jet ski, schedule pontoon launch",
        propertyId: cabin.id,
        category: "seasonal",
        frequencyDays: 365,
        nextDueDate: advanceToFuture("2026-05-01", 365),
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

/** Seed starter chores if the chores table is empty */
export async function seedChoresIfEmpty() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(choresTable);

    if (count > 0) return;

    const members = await db.select().from(familyMembersTable).orderBy(familyMembersTable.id);
    const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.id);

    if (!members.length || !properties.length) return;

    const byName = (name: string) => members.find((m) => m.name === name);
    const aj = byName("AJ");
    const emily = byName("Emily");
    const holden = byName("Holden");
    const brody = byName("Brody");
    const daphne = byName("Daphne");

    const house = properties.find((p) => p.type === "house");
    const cabin = properties.find((p) => p.type === "cabin");
    if (!house || !cabin) return;

    const today = new Date();
    const t = (d: Date) => d.toISOString().split("T")[0];

    logger.info("Seeding starter chores...");

    await db.insert(choresTable).values([
      // House — daily chores
      {
        title: "Unload dishwasher",
        propertyId: house.id,
        frequency: "daily",
        dueDate: t(today),
        points: 5,
      },
      {
        title: "Feed Willa",
        propertyId: house.id,
        frequency: "daily",
        dueDate: t(today),
        points: 5,
      },
      {
        title: "Wipe down kitchen counters",
        propertyId: house.id,
        frequency: "daily",
        dueDate: t(today),
        points: 5,
      },
      // House — weekly chores (unassigned)
      {
        title: "Take out trash & recycling",
        propertyId: house.id,
        frequency: "weekly",
        dueDate: t(today),
        points: 10,
      },
      {
        title: "Vacuum main floor",
        propertyId: house.id,
        frequency: "weekly",
        dueDate: addDays(today, 2),
        points: 10,
      },
      {
        title: "Mop floors",
        propertyId: house.id,
        frequency: "weekly",
        dueDate: addDays(today, 3),
        points: 10,
      },
      {
        title: "Clean bathrooms",
        propertyId: house.id,
        frequency: "weekly",
        dueDate: addDays(today, 4),
        points: 15,
      },
      {
        title: "Mow lawn",
        propertyId: house.id,
        frequency: "weekly",
        dueDate: addDays(today, 5),
        points: 20,
      },
      // AJ's chores
      ...(aj
        ? [
            {
              title: "Do laundry",
              assigneeId: aj.id,
              propertyId: house.id,
              frequency: "weekly",
              dueDate: addDays(today, 1),
              points: 15,
            },
          ]
        : []),
      // Emily's chores
      ...(emily
        ? [
            {
              title: "Meal prep",
              assigneeId: emily.id,
              propertyId: house.id,
              frequency: "weekly",
              dueDate: addDays(today, 0),
              points: 15,
            },
          ]
        : []),
      // Kids' chores — Holden (10)
      ...(holden
        ? [
            {
              title: "Clean room",
              assigneeId: holden.id,
              propertyId: house.id,
              frequency: "weekly",
              dueDate: addDays(today, 1),
              points: 10,
            },
            {
              title: "Take out trash",
              assigneeId: holden.id,
              propertyId: house.id,
              frequency: "weekly",
              dueDate: t(today),
              points: 10,
            },
          ]
        : []),
      // Kids' chores — Brody (8)
      ...(brody
        ? [
            {
              title: "Clean room",
              assigneeId: brody.id,
              propertyId: house.id,
              frequency: "weekly",
              dueDate: addDays(today, 1),
              points: 10,
            },
            {
              title: "Unload dishwasher",
              assigneeId: brody.id,
              propertyId: house.id,
              frequency: "daily",
              dueDate: t(today),
              points: 5,
            },
          ]
        : []),
      // Kids' chores — Daphne (5)
      ...(daphne
        ? [
            {
              title: "Pick up toys",
              assigneeId: daphne.id,
              propertyId: house.id,
              frequency: "daily",
              dueDate: t(today),
              points: 5,
            },
            {
              title: "Help set the table",
              assigneeId: daphne.id,
              propertyId: house.id,
              frequency: "daily",
              dueDate: t(today),
              points: 5,
            },
          ]
        : []),
    ]);

    logger.info("Starter chores seeded successfully");
  } catch (err) {
    logger.error({ err }, "Failed to seed chores");
  }
}

/** Fix any seasonal maintenance tasks whose nextDueDate is in the past */
export async function fixStaleMaintenanceDates() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const stale = await db
      .select()
      .from(maintenanceTasksTable)
      .where(lt(maintenanceTasksTable.nextDueDate, today));

    if (!stale.length) return;

    logger.info({ count: stale.length }, "Fixing stale maintenance due dates");

    for (const task of stale) {
      const fixed = advanceToFuture(task.nextDueDate, task.frequencyDays);
      await db
        .update(maintenanceTasksTable)
        .set({ nextDueDate: fixed })
        .where(sql`id = ${task.id}`);
    }

    logger.info("Maintenance dates fixed");
  } catch (err) {
    logger.error({ err }, "Failed to fix maintenance dates");
  }
}

/** Seed cleaner-specific maintenance tasks for the Main House if none exist */
export async function ensureHouseCleanerTasks() {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(maintenanceTasksTable)
      .where(sql`is_cleaner_task = true`);

    if (count > 0) return;

    const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.id);
    const house = properties.find((p) => p.type === "house");
    if (!house) return;

    const today = new Date();
    const addD = (d: Date, n: number) => {
      const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().split("T")[0];
    };

    logger.info("Seeding cleaner maintenance tasks for Main House...");

    await db.insert(maintenanceTasksTable).values([
      {
        title: "Deep clean kitchen",
        description: "Clean oven, microwave, behind appliances, and inside cabinets",
        propertyId: house.id,
        category: "cleaning",
        frequencyDays: 30,
        isCleanerTask: true,
        nextDueDate: addD(today, 7),
      },
      {
        title: "Clean all bathrooms",
        description: "Scrub toilets, tubs, sinks, and mop floors",
        propertyId: house.id,
        category: "cleaning",
        frequencyDays: 14,
        isCleanerTask: true,
        nextDueDate: addD(today, 5),
      },
      {
        title: "Vacuum and mop all floors",
        description: "All rooms including under furniture",
        propertyId: house.id,
        category: "cleaning",
        frequencyDays: 14,
        isCleanerTask: true,
        nextDueDate: addD(today, 5),
      },
      {
        title: "Clean interior windows",
        description: "Wipe down all interior window glass and sills",
        propertyId: house.id,
        category: "cleaning",
        frequencyDays: 90,
        isCleanerTask: true,
        nextDueDate: addD(today, 30),
      },
      {
        title: "Wash bedding & linens",
        description: "All beds, pillow cases, and bathroom towels",
        propertyId: house.id,
        category: "cleaning",
        frequencyDays: 14,
        isCleanerTask: true,
        nextDueDate: addD(today, 3),
      },
    ]);

    logger.info("Cleaner tasks seeded successfully");
  } catch (err) {
    logger.error({ err }, "Failed to seed cleaner tasks");
  }
}

/** Seed a "Cleaner" family member + cabin chores assigned to them (idempotent) */
export async function seedCleanerIfEmpty() {
  try {
    // Check if Cleaner already exists
    const existing = await db
      .select()
      .from(familyMembersTable)
      .where(eq(familyMembersTable.name, "Cleaner"));
    if (existing.length) return;

    // Create Cleaner family member
    const [cleaner] = await db
      .insert(familyMembersTable)
      .values({ name: "Cleaner", role: "cleaner", color: "#9B89C4", avatarInitials: "CL" })
      .returning();

    // Find Cabin property
    const cabins = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.name, "Cabin"));
    if (!cabins.length) return;
    const cabin = cabins[0];

    const today = new Date();
    const addD = (d: Date, n: number) => {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r.toISOString().split("T")[0];
    };

    await db.insert(choresTable).values([
      { title: "Clean bathrooms", assigneeId: cleaner.id, propertyId: cabin.id, frequency: "weekly", dueDate: addD(today, 0), points: 20 },
      { title: "Vacuum all rooms", assigneeId: cleaner.id, propertyId: cabin.id, frequency: "weekly", dueDate: addD(today, 3), points: 15 },
      { title: "Wipe kitchen counters & appliances", assigneeId: cleaner.id, propertyId: cabin.id, frequency: "weekly", dueDate: addD(today, 0), points: 15 },
      { title: "Change bed linens", assigneeId: cleaner.id, propertyId: cabin.id, frequency: "biweekly", dueDate: addD(today, 7), points: 20 },
      { title: "Sweep & mop floors", assigneeId: cleaner.id, propertyId: cabin.id, frequency: "weekly", dueDate: addD(today, 0), points: 15 },
    ]);

    logger.info("Cleaner family member and cabin chores seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed cleaner");
  }
}
