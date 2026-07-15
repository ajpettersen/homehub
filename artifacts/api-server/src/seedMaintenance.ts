/**
 * Seeds a comprehensive, property-specific recurring maintenance task list.
 * Safe to run on every startup — checks existing titles to avoid duplicates.
 *
 * Based on:
 *   Main House — furnace, boiler, A/C, gas fireplace, pool, irrigation,
 *                water softener, basement, garage, LP SmartSide, 30+ yr home
 *   Cabin      — furnace, fireplace/chimney, well, septic, generator,
 *                dock, outdoor shower
 */
import { db } from "@workspace/db";
import { maintenanceTasksTable, propertiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./lib/logger";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

/** Spread due dates deterministically so tasks aren't all due at once */
function spread(index: number, freqDays: number): string {
  // Offset between 10% and 70% of the frequency, stepped by index
  const band = Math.max(7, Math.floor(freqDays * 0.6));
  const base = Math.max(5, Math.floor(freqDays * 0.1));
  const offset = base + (index * 7) % band;
  return daysFromNow(Math.min(offset, freqDays - 1));
}

interface TaskDef {
  title: string;
  description?: string;
  category: string;
  frequencyDays: number;
  isCleanerTask?: boolean;
}

const MAIN_HOUSE_TASKS: TaskDef[] = [
  // ── Furnace / Forced Air
  {
    title: "Furnace annual tune-up",
    description: "Schedule HVAC tech to inspect heat exchanger, burners, and flue",
    category: "appliance", frequencyDays: 365,
  },
  // ── Boiler / Radiators
  {
    title: "Bleed boiler radiators",
    description: "Release trapped air from radiators before heating season",
    category: "appliance", frequencyDays: 365,
  },
  {
    title: "Boiler annual service",
    description: "Professional inspection of boiler, pressure, and expansion tank",
    category: "appliance", frequencyDays: 365,
  },
  // ── Central A/C
  {
    title: "Replace A/C filter",
    description: "Swap out central A/C return air filter",
    category: "filter", frequencyDays: 60,
  },
  {
    title: "A/C annual tune-up",
    description: "Clean coils, check refrigerant, test capacitors — schedule spring",
    category: "appliance", frequencyDays: 365,
  },
  {
    title: "Clean A/C condensate drain line",
    description: "Flush with diluted bleach to prevent clogs and water damage",
    category: "water", frequencyDays: 180,
  },
  // ── Gas Fireplace
  {
    title: "Gas fireplace inspection & cleaning",
    description: "Annual service: clean burner, check gas line, inspect logs and glass",
    category: "appliance", frequencyDays: 365,
  },
  // ── Pool / Hot Tub
  {
    title: "Pool chemical check & balance",
    description: "Test pH, chlorine, alkalinity — adjust as needed",
    category: "water", frequencyDays: 7,
  },
  {
    title: "Clean pool filter",
    description: "Backwash or rinse cartridge filter",
    category: "filter", frequencyDays: 30,
  },
  {
    title: "Open pool for season",
    description: "Remove cover, reinstall equipment, shock water, balance chemicals",
    category: "seasonal", frequencyDays: 365,
  },
  {
    title: "Close pool for winter",
    description: "Balance water, add winterizer, blow out lines, cover pool",
    category: "seasonal", frequencyDays: 365,
  },
  // ── Irrigation / Sprinklers
  {
    title: "Irrigation spring startup",
    description: "Turn on system, inspect heads, adjust zones after winter",
    category: "seasonal", frequencyDays: 365,
  },
  {
    title: "Irrigation fall winterization",
    description: "Blow out all lines with compressor before first hard freeze",
    category: "seasonal", frequencyDays: 365,
  },
  {
    title: "Check irrigation heads for damage",
    description: "Walk all zones looking for broken or misaligned heads",
    category: "yard", frequencyDays: 90,
  },
  // ── Water Softener
  {
    title: "Refill water softener salt",
    description: "Check brine tank level, refill with salt pellets as needed",
    category: "water", frequencyDays: 30,
  },
  {
    title: "Water softener annual service",
    description: "Clean brine tank, check resin, verify regeneration cycle",
    category: "appliance", frequencyDays: 365,
  },
  // ── Basement
  {
    title: "Inspect basement for moisture & cracks",
    description: "Check walls, floor, and window wells for water intrusion",
    category: "water", frequencyDays: 90,
  },
  // ── Garage
  {
    title: "Test garage door auto-reverse",
    description: "Place 2x4 flat on ground, door should reverse on contact",
    category: "appliance", frequencyDays: 90,
  },
  {
    title: "Lubricate garage door & tracks",
    description: "Apply silicone spray to rollers, hinges, tracks, and springs",
    category: "appliance", frequencyDays: 180,
  },
  // ── LP SmartSide Exterior
  {
    title: "Inspect LP SmartSide for damage & caulking",
    description: "Walk perimeter checking for cracks, gaps, or swelling; re-caulk as needed",
    category: "other", frequencyDays: 180,
  },
  {
    title: "Touch up LP SmartSide paint & caulk",
    description: "Full touch-up of chipped paint and failing caulk joints",
    category: "other", frequencyDays: 1095,
  },
  // ── General (30-yr home, updated 7 yrs ago)
  {
    title: "Clean gutters",
    description: "Clear leaves and debris from all gutters and downspouts — spring & fall",
    category: "yard", frequencyDays: 180,
  },
  {
    title: "Flush water heater",
    description: "Drain sediment from tank bottom, check anode rod",
    category: "water", frequencyDays: 365,
  },
  {
    title: "Inspect roof for damage",
    description: "Check shingles, flashing, and soffits — binoculars from ground is fine",
    category: "other", frequencyDays: 365,
  },
  {
    title: "Check attic for moisture & pests",
    description: "Inspect insulation, ventilation, and rafters for signs of water or critters",
    category: "other", frequencyDays: 180,
  },
  {
    title: "Clean kitchen exhaust hood filter",
    description: "Soak grease filter in hot soapy water or run through dishwasher",
    category: "appliance", frequencyDays: 30,
  },
  {
    title: "Check GFCI outlets & circuit breakers",
    description: "Test all GFCI outlets, look for tripped breakers in panel",
    category: "other", frequencyDays: 365,
  },
  {
    title: "Caulk around tubs, showers & sinks",
    description: "Remove old failing caulk and apply fresh bead to prevent water damage",
    category: "water", frequencyDays: 365,
  },
  // ── Cleaner Tasks (Main House only)
  {
    title: "Deep clean kitchen appliances",
    description: "Clean inside oven, microwave, and behind/under appliances",
    category: "cleaning", frequencyDays: 30, isCleanerTask: true,
  },
  {
    title: "Clean all windows (interior)",
    description: "Wash all interior window glass and wipe sills",
    category: "cleaning", frequencyDays: 90, isCleanerTask: true,
  },
];

const CABIN_TASKS: TaskDef[] = [
  // ── Furnace
  {
    title: "Cabin furnace annual tune-up",
    description: "Schedule HVAC service for cabin furnace before heating season",
    category: "appliance", frequencyDays: 365,
  },
  // ── Fireplace / Chimney
  {
    title: "Chimney inspection & sweep",
    description: "Annual inspection and cleaning of fireplace flue and chimney cap",
    category: "appliance", frequencyDays: 365,
  },
  // ── Well Water
  {
    title: "Annual well water test",
    description: "Test for bacteria, nitrates, and pH — submit to county lab or home kit",
    category: "water", frequencyDays: 365,
  },
  {
    title: "Check well pressure tank & pump",
    description: "Verify pressure switch, tank bladder, and pump run time are normal",
    category: "water", frequencyDays: 365,
  },
  // ── Septic
  {
    title: "Pump septic tank",
    description: "Schedule septic pumping service — every 3 years for typical use",
    category: "water", frequencyDays: 1095,
  },
  {
    title: "Septic system inspection",
    description: "Inspect distribution box, drain field, and tank levels annually",
    category: "water", frequencyDays: 365,
  },
  // ── Generator
  {
    title: "Monthly generator test run",
    description: "Run generator under load for 20–30 minutes, check oil and output",
    category: "appliance", frequencyDays: 30,
  },
  {
    title: "Generator annual service & oil change",
    description: "Change oil and filter, inspect spark plugs, air filter, and battery",
    category: "appliance", frequencyDays: 365,
  },
  {
    title: "Add fuel stabilizer to generator tank",
    description: "Treat fuel before end-of-season storage to prevent gum buildup",
    category: "appliance", frequencyDays: 180,
  },
  // ── Dock
  {
    title: "Install dock for season",
    description: "Set dock sections, check bolts and decking for damage",
    category: "seasonal", frequencyDays: 365,
  },
  {
    title: "Remove & store dock for winter",
    description: "Pull dock sections before ice-up, store on shore",
    category: "seasonal", frequencyDays: 365,
  },
  {
    title: "Inspect dock for rot & damage",
    description: "Check all boards, hardware, and flotation for wear",
    category: "other", frequencyDays: 180,
  },
  // ── Outdoor Shower
  {
    title: "Winterize outdoor shower",
    description: "Shut off supply, blow out lines, remove and store showerhead",
    category: "seasonal", frequencyDays: 365,
  },
  {
    title: "Outdoor shower spring startup",
    description: "Reconnect supply, check for leaks, test hot/cold mixing",
    category: "seasonal", frequencyDays: 365,
  },
  // ── General Cabin
  {
    title: "Check cabin for rodent & pest signs",
    description: "Inspect entry points, traps, and food storage for critter activity",
    category: "other", frequencyDays: 30,
  },
  {
    title: "Inspect cabin roof & flashing",
    description: "Check shingles, ridge cap, and flashing around chimney",
    category: "other", frequencyDays: 365,
  },
  {
    title: "Check cabin for water damage & leaks",
    description: "Inspect ceiling, walls, and crawl space for water intrusion",
    category: "water", frequencyDays: 30,
  },
  {
    title: "Clean cabin gutters",
    description: "Clear leaves and pine needles from gutters and downspouts",
    category: "yard", frequencyDays: 180,
  },
  {
    title: "Test cabin smoke & CO detectors",
    description: "Test all detectors and replace batteries as needed",
    category: "other", frequencyDays: 180,
  },
  {
    title: "Flush cabin water heater",
    description: "Drain sediment from tank, check pressure relief valve",
    category: "water", frequencyDays: 365,
  },
  {
    title: "Restock emergency & first aid kit",
    description: "Check expiry dates, replace used or expired items",
    category: "other", frequencyDays: 365,
  },
];

export async function seedRecurringMaintenanceTasks(): Promise<void> {
  try {
    const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.id);
    const house = properties.find((p) => p.type === "house");
    const cabin = properties.find((p) => p.type === "cabin");
    if (!house || !cabin) return;

    // Get existing titles per property (lowercase for dedup)
    const existing = await db.select({
      title: maintenanceTasksTable.title,
      propertyId: maintenanceTasksTable.propertyId,
    }).from(maintenanceTasksTable);

    const existingSet = new Set(
      existing.map((r) => `${r.propertyId}::${r.title.toLowerCase().trim()}`),
    );

    const has = (propId: number, title: string) =>
      existingSet.has(`${propId}::${title.toLowerCase().trim()}`);

    const toInsert: typeof maintenanceTasksTable.$inferInsert[] = [];

    MAIN_HOUSE_TASKS.forEach((t, i) => {
      if (has(house.id, t.title)) return;
      toInsert.push({
        title: t.title,
        description: t.description,
        propertyId: house.id,
        category: t.category,
        frequencyDays: t.frequencyDays,
        isCleanerTask: t.isCleanerTask ?? false,
        nextDueDate: spread(i, t.frequencyDays),
      });
    });

    CABIN_TASKS.forEach((t, i) => {
      if (has(cabin.id, t.title)) return;
      toInsert.push({
        title: t.title,
        description: t.description,
        propertyId: cabin.id,
        category: t.category,
        frequencyDays: t.frequencyDays,
        isCleanerTask: false,
        nextDueDate: spread(i, t.frequencyDays),
      });
    });

    if (!toInsert.length) {
      logger.info("Recurring maintenance tasks already up to date");
      return;
    }

    logger.info({ count: toInsert.length }, "Seeding recurring maintenance tasks...");
    // Insert in batches of 20
    for (let i = 0; i < toInsert.length; i += 20) {
      await db.insert(maintenanceTasksTable).values(toInsert.slice(i, i + 20));
    }
    logger.info("Recurring maintenance tasks seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed recurring maintenance tasks");
  }
}
