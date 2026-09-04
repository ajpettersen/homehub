import { Router } from "express";
import {
  db,
  householdsTable,
  propertiesTable,
  familyMembersTable,
  groceryListsTable,
  choresTable,
  maintenanceTasksTable,
  userProfilesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();

const VALID_MEMBER_ROLES = ["child", "pet"];
const VALID_CHORE_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "custom"];
const VALID_MAINTENANCE_CATEGORIES = ["filter", "water", "seasonal", "appliance", "yard", "other", "cleaning"];
const VALID_PROPERTY_TYPES = ["house", "cabin"];
const MAX_ITEMS = 25;

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * POST /api/onboarding — seed the household from first-login setup.
 *
 * Runs the entire seeding (household rename, property, family members, starter
 * grocery list / chores / maintenance tasks) plus the onboarding-complete flag
 * in ONE database transaction, so a failure leaves nothing behind and a retry
 * can never create duplicates. If the household already completed onboarding
 * (e.g. the response to a previous successful call was lost), the request is a
 * no-op that reports alreadyCompleted.
 */
router.post("/onboarding", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);

    if (scope.role !== "family" || !scope.isAdmin) {
      res.status(403).json({ error: "Household administrator access required" });
      return;
    }

    const { rerun, householdName, property, familyMembers, groceryListName, chores, maintenanceTasks } =
      (req.body ?? {}) as {
        rerun?: unknown;
        householdName?: unknown;
        property?: { name?: unknown; type?: unknown; address?: unknown };
        familyMembers?: Array<{ name?: unknown; role?: unknown; color?: unknown }>;
        groceryListName?: unknown;
        chores?: Array<{ title?: unknown; frequency?: unknown }>;
        maintenanceTasks?: Array<{ title?: unknown; category?: unknown; frequencyDays?: unknown }>;
      };

    // ── Validate everything up front so the transaction can't half-fail on input ──
    if (rerun !== undefined && typeof rerun !== "boolean") {
      res.status(400).json({ error: "rerun must be a boolean" });
      return;
    }
    if (!isNonEmptyString(householdName)) {
      res.status(400).json({ error: "householdName is required" });
      return;
    }
    if (!property || !isNonEmptyString(property.name)) {
      res.status(400).json({ error: "property.name is required" });
      return;
    }
    const propertyType = property.type ?? "house";
    if (typeof propertyType !== "string" || !VALID_PROPERTY_TYPES.includes(propertyType)) {
      res.status(400).json({ error: "property.type must be house or cabin" });
      return;
    }
    const members = Array.isArray(familyMembers) ? familyMembers : null;
    if (!members || members.length > MAX_ITEMS) {
      res.status(400).json({ error: "familyMembers must be an array" });
      return;
    }
    for (const member of members) {
      if (!isNonEmptyString(member?.name) ||
          typeof member?.role !== "string" || !VALID_MEMBER_ROLES.includes(member.role) ||
          !isNonEmptyString(member?.color)) {
        res.status(400).json({ error: "Each family member needs a name, a valid role, and a color" });
        return;
      }
    }
    if (groceryListName !== undefined && groceryListName !== null && !isNonEmptyString(groceryListName)) {
      res.status(400).json({ error: "groceryListName cannot be empty" });
      return;
    }
    const choreInputs = chores ?? [];
    if (!Array.isArray(choreInputs) || choreInputs.length > MAX_ITEMS) {
      res.status(400).json({ error: "chores must be an array" });
      return;
    }
    for (const chore of choreInputs) {
      if (!isNonEmptyString(chore?.title) ||
          typeof chore?.frequency !== "string" || !VALID_CHORE_FREQUENCIES.includes(chore.frequency)) {
        res.status(400).json({ error: "Each starter chore needs a title and a valid frequency" });
        return;
      }
    }
    const maintenanceInputs = maintenanceTasks ?? [];
    if (!Array.isArray(maintenanceInputs) || maintenanceInputs.length > MAX_ITEMS) {
      res.status(400).json({ error: "maintenanceTasks must be an array" });
      return;
    }
    for (const task of maintenanceInputs) {
      if (!isNonEmptyString(task?.title) ||
          typeof task?.category !== "string" || !VALID_MAINTENANCE_CATEGORIES.includes(task.category) ||
          !Number.isInteger(task?.frequencyDays) || (task.frequencyDays as number) < 1) {
        res.status(400).json({ error: "Each starter maintenance task needs a title, a valid category, and a positive frequencyDays" });
        return;
      }
    }

    // ── Seed everything atomically ──
    const result = await db.transaction(async (tx) => {
      const [household] = await tx
        .select()
        .from(householdsTable)
        .where(eq(householdsTable.id, scope.householdId))
        .for("update");

      if (!household) {
        return { status: 404 as const };
      }
      if (household.onboardingCompletedAt !== null && rerun !== true) {
        if (scope.linkedFamilyMemberId) {
          await tx.update(userProfilesTable).set({ personalSetupCompletedAt: new Date() }).where(and(
            eq(userProfilesTable.clerkId, scope.clerkId),
            eq(userProfilesTable.householdId, scope.householdId),
            eq(userProfilesTable.linkedFamilyMemberId, scope.linkedFamilyMemberId),
          ));
        }
        // A previous call already committed (its response may have been lost).
        return { status: 200 as const, alreadyCompleted: true };
      }

      if (rerun === true) {
        const normalize = (value: string) => value.trim().toLocaleLowerCase();
        const existingProperties = await tx
          .select()
          .from(propertiesTable)
          .where(eq(propertiesTable.householdId, scope.householdId))
          .orderBy(propertiesTable.createdAt, propertiesTable.id);

        let targetProperty = existingProperties[0];
        if (targetProperty) {
          const [updatedProperty] = await tx
            .update(propertiesTable)
            .set({
              name: (property.name as string).trim(),
              type: propertyType,
              icon: propertyType === "cabin" ? "mountain" : "home",
              address: isNonEmptyString(property.address) ? property.address.trim() : null,
            })
            .where(eq(propertiesTable.id, targetProperty.id))
            .returning();
          targetProperty = updatedProperty;
        } else {
          [targetProperty] = await tx
            .insert(propertiesTable)
            .values({
              householdId: scope.householdId,
              name: (property.name as string).trim(),
              type: propertyType,
              icon: propertyType === "cabin" ? "mountain" : "home",
              address: isNonEmptyString(property.address) ? property.address.trim() : null,
            })
            .returning();
        }

        await tx
          .update(householdsTable)
          .set({ name: householdName.trim() })
          .where(eq(householdsTable.id, scope.householdId));

        const existingMembers = await tx
          .select()
          .from(familyMembersTable)
          .where(eq(familyMembersTable.householdId, scope.householdId));
        const memberKeys = new Set(existingMembers.map((member) => `${normalize(member.name)}:${member.role}`));
        for (const member of members) {
          const name = (member.name as string).trim();
          const key = `${normalize(name)}:${member.role}`;
          if (memberKeys.has(key)) continue;
          await tx.insert(familyMembersTable).values({
            householdId: scope.householdId,
            name,
            role: member.role as string,
            color: member.color as string,
            avatarInitials: name.charAt(0).toUpperCase(),
            photoUrl: null,
          });
          memberKeys.add(key);
        }

        if (isNonEmptyString(groceryListName)) {
          const existingLists = await tx
            .select()
            .from(groceryListsTable)
            .where(eq(groceryListsTable.propertyId, targetProperty.id));
          if (!existingLists.some((list) => normalize(list.name) === normalize(groceryListName))) {
            await tx.insert(groceryListsTable).values({
              name: groceryListName.trim(),
              propertyId: targetProperty.id,
            });
          }
        }

        const existingChores = await tx
          .select()
          .from(choresTable)
          .where(eq(choresTable.propertyId, targetProperty.id));
        const choreKeys = new Set(existingChores.map((chore) => `${normalize(chore.title)}:${chore.frequency}`));
        for (const chore of choreInputs) {
          const title = (chore.title as string).trim();
          const key = `${normalize(title)}:${chore.frequency}`;
          if (choreKeys.has(key)) continue;
          await tx.insert(choresTable).values({
            title,
            assigneeId: null,
            propertyId: targetProperty.id,
            frequency: chore.frequency as string,
            dueDate: null,
            points: 10,
          });
          choreKeys.add(key);
        }

        const existingMaintenance = await tx
          .select()
          .from(maintenanceTasksTable)
          .where(eq(maintenanceTasksTable.propertyId, targetProperty.id));
        const maintenanceKeys = new Set(
          existingMaintenance.map((task) => `${normalize(task.title)}:${task.category}`),
        );
        for (const task of maintenanceInputs) {
          const title = (task.title as string).trim();
          const key = `${normalize(title)}:${task.category}`;
          if (maintenanceKeys.has(key)) continue;
          const frequencyDays = task.frequencyDays as number;
          await tx.insert(maintenanceTasksTable).values({
            title,
            description: null,
            propertyId: targetProperty.id,
            category: task.category as string,
            frequencyDays,
            scheduleType: "recurring",
            isCompleted: false,
            isCleanerTask: false,
            startDate: null,
            nextDueDate: isoDateFromToday(0),
          });
          maintenanceKeys.add(key);
        }

        return { status: 200 as const, alreadyCompleted: false };
      }

      // Preserve every existing family member. In particular, the bootstrap
      // administrator's account-backed adult and any legacy/link state must
      // survive setup. The wizard only adds child/pet extras.
      await tx
        .update(householdsTable)
        .set({ name: householdName.trim(), onboardingCompletedAt: new Date() })
        .where(eq(householdsTable.id, scope.householdId));
      if (scope.linkedFamilyMemberId) {
        await tx.update(userProfilesTable).set({ personalSetupCompletedAt: new Date() }).where(and(
          eq(userProfilesTable.clerkId, scope.clerkId),
          eq(userProfilesTable.householdId, scope.householdId),
          eq(userProfilesTable.linkedFamilyMemberId, scope.linkedFamilyMemberId),
        ));
      }

      const [createdProperty] = await tx
        .insert(propertiesTable)
        .values({
          householdId: scope.householdId,
          name: (property.name as string).trim(),
          type: propertyType,
          icon: propertyType === "cabin" ? "mountain" : "home",
          address: isNonEmptyString(property.address) ? property.address.trim() : null,
        })
        .returning();

      for (const member of members) {
        const name = (member.name as string).trim();
        await tx.insert(familyMembersTable).values({
          householdId: scope.householdId,
          name,
          role: member.role as string,
          color: member.color as string,
          avatarInitials: name.charAt(0).toUpperCase(),
          photoUrl: null,
        });
      }

      if (isNonEmptyString(groceryListName)) {
        await tx.insert(groceryListsTable).values({
          name: groceryListName.trim(),
          propertyId: createdProperty.id,
        });
      }

      for (const chore of choreInputs) {
        await tx.insert(choresTable).values({
          title: (chore.title as string).trim(),
          assigneeId: null,
          propertyId: createdProperty.id,
          frequency: chore.frequency as string,
          dueDate: null,
          points: 10,
        });
      }

      for (const task of maintenanceInputs) {
        const frequencyDays = task.frequencyDays as number;
        await tx.insert(maintenanceTasksTable).values({
          title: (task.title as string).trim(),
          description: null,
          propertyId: createdProperty.id,
          category: task.category as string,
          frequencyDays,
          scheduleType: "recurring",
          isCompleted: false,
          isCleanerTask: false,
          startDate: null,
          // Starter maintenance should be visible immediately; completing it
          // schedules the next occurrence from its repeat interval.
          nextDueDate: isoDateFromToday(0),
        });
      }

      return { status: 200 as const, alreadyCompleted: false };
    });

    if (result.status === 404) {
      res.status(404).json({ error: "Household not found" });
      return;
    }
    res.json({ onboardingCompleted: true, alreadyCompleted: result.alreadyCompleted });
  } catch (err) {
    req.log.error({ err }, "Failed to complete onboarding");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
