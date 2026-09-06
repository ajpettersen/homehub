import { Router } from "express";
import { db } from "@workspace/db";
import {
  aiMemoriesTable,
  choresTable,
  familyMembersTable,
  maintenanceTasksTable,
  mealRatingsTable,
  todoItemsTable,
  todoListsTable,
  userProfilesTable,
  workoutParticipantsTable,
  workoutsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getPropertyAuthorizationScope, type PropertyAuthorizationScope } from "../lib/propertyAuthorization";
import { getEffectiveClerkId } from "../lib/effectiveClerkId";
import { requireApprovedLinkedAdult as requireApprovedLinkedAdultScope } from "../middlewares/requireApprovedHousehold";

const router = Router();

const VALID_ROLES = ["parent", "child", "pet"] as const;

async function requireHouseholdScope(
  req: any,
  res: any,
  familyAdminOnly = false,
): Promise<PropertyAuthorizationScope | null> {
  const clerkId = getEffectiveClerkId(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const scope = await getPropertyAuthorizationScope(clerkId);
  if (!scope || (familyAdminOnly && (scope.role !== "family" || !scope.isAdmin))) {
    res.status(403).json({ error: familyAdminOnly ? "Family administrator access required" : "Household access required" });
    return null;
  }
  return scope;
}

async function requireApprovedLinkedAdult(
  req: any,
  res: any,
): Promise<PropertyAuthorizationScope | null> {
  const scope = await requireHouseholdScope(req, res);
  if (!scope) return null;
  res.locals.homeHubScope = scope;
  return requireApprovedLinkedAdultScope(res);
}

function memberToJson(m: any, linkedAccount: { clerkId: string } | null = null) {
  return {
    id: String(m.id),
    name: m.name,
    role: m.role,
    color: m.color,
    photoUrl: m.photoUrl ?? null,
    hasLinkedAccount: linkedAccount !== null,
  };
}

router.get("/family-members", async (req, res) => {
  try {
    const scope = await requireHouseholdScope(req, res);
    if (!scope) return;
    const members = await db
      .select({ member: familyMembersTable, linkedAccount: { clerkId: userProfilesTable.clerkId } })
      .from(familyMembersTable)
      .leftJoin(userProfilesTable, and(
        eq(userProfilesTable.linkedFamilyMemberId, familyMembersTable.id),
        eq(userProfilesTable.householdId, scope.householdId),
        eq(userProfilesTable.role, "family"),
      ))
      .where(eq(familyMembersTable.householdId, scope.householdId))
      .orderBy(familyMembersTable.id);
    res.json(members.map(({ member, linkedAccount }) => memberToJson(member, linkedAccount)));
  } catch (err) {
    req.log.error({ err }, "Failed to get family members");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/family-members", async (req, res) => {
  try {
    const scope = await requireApprovedLinkedAdult(req, res);
    if (!scope) return;
    const { name, role, color, photoUrl } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!["child", "pet"].includes(role)) {
      res.status(400).json({ error: "Standalone adults cannot be created; role must be child or pet" });
      return;
    }
    if (!color || typeof color !== "string") {
      res.status(400).json({ error: "color is required" });
      return;
    }

    const [member] = await db
      .insert(familyMembersTable)
      .values({
        householdId: scope.householdId,
        name: name.trim(),
        role,
        color,
        avatarInitials: name.trim().charAt(0).toUpperCase(),
        photoUrl: photoUrl ?? null,
      })
      .returning();

    res.status(201).json(memberToJson(member));
  } catch (err) {
    req.log.error({ err }, "Failed to create family member");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/family-members/:id", async (req, res) => {
  try {
    const scope = await requireApprovedLinkedAdult(req, res);
    if (!scope) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { name, role, color, photoUrl } = req.body ?? {};
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: "role must be parent | child | pet" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name must not be empty" });
        return;
      }
      updates.name = name.trim();
      updates.avatarInitials = name.trim().charAt(0).toUpperCase();
    }
    if (role !== undefined) updates.role = role;
    if (color !== undefined) updates.color = color;
    if (photoUrl !== undefined) updates.photoUrl = photoUrl ?? null;

    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(familyMembersTable).where(and(
        eq(familyMembersTable.id, id),
        eq(familyMembersTable.householdId, scope.householdId),
      )).for("update").limit(1);
      if (!current) return null;

      const links = await tx.select({
        clerkId: userProfilesTable.clerkId,
        householdId: userProfilesTable.householdId,
        role: userProfilesTable.role,
      })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.linkedFamilyMemberId, id))
        .for("update");
      const linked = links.find(link =>
        link.householdId === scope.householdId && link.role === "family",
      ) ?? null;

      if (role !== undefined && role !== "parent" && links.length > 0) {
        throw Object.assign(new Error("A linked adult cannot be changed to a child or pet"), { status: 409 });
      }
      if (current.role !== "parent" && role === "parent") {
        throw Object.assign(new Error("Adult profiles must be created through account approval or an invite"), { status: 400 });
      }

      const [updated] = await tx.update(familyMembersTable).set(updates).where(and(
        eq(familyMembersTable.id, id),
        eq(familyMembersTable.householdId, scope.householdId),
      )).returning();
      return { member: updated, linkedAccount: linked };
    });

    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(memberToJson(result.member, result.linkedAccount));
  } catch (err) {
    if (typeof (err as any)?.status === "number") {
      res.status((err as any).status).json({ error: (err as Error).message });
      return;
    }
    req.log.error({ err }, "Failed to update family member");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/family-members/:id", async (req, res) => {
  try {
    const scope = await requireApprovedLinkedAdult(req, res);
    if (!scope) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db.transaction(async (tx) => {
      const [member] = await tx.select({ id: familyMembersTable.id }).from(familyMembersTable)
        .where(and(eq(familyMembersTable.id, id), eq(familyMembersTable.householdId, scope.householdId)))
        .for("update").limit(1);
      if (!member) return "missing";
      const [linked] = await tx.select({ id: userProfilesTable.id }).from(userProfilesTable)
        .where(eq(userProfilesTable.linkedFamilyMemberId, id)).limit(1);
      if (linked) return "linked";
      const references = await Promise.all([
        tx.select({ id: choresTable.id }).from(choresTable).where(eq(choresTable.assigneeId, id)).limit(1),
        tx.select({ id: todoListsTable.id }).from(todoListsTable).where(eq(todoListsTable.assigneeId, id)).limit(1),
        tx.select({ id: todoItemsTable.id }).from(todoItemsTable).where(eq(todoItemsTable.assigneeId, id)).limit(1),
        tx.select({ id: maintenanceTasksTable.id }).from(maintenanceTasksTable).where(eq(maintenanceTasksTable.assigneeId, id)).limit(1),
        tx.select({ id: workoutsTable.id }).from(workoutsTable).where(eq(workoutsTable.memberId, id)).limit(1),
        tx.select({ memberId: workoutParticipantsTable.memberId }).from(workoutParticipantsTable).where(eq(workoutParticipantsTable.memberId, id)).limit(1),
        tx.select({ id: mealRatingsTable.id }).from(mealRatingsTable).where(eq(mealRatingsTable.memberId, id)).limit(1),
        tx.select({ id: aiMemoriesTable.id }).from(aiMemoriesTable).where(eq(aiMemoriesTable.subjectFamilyMemberId, id)).limit(1),
      ]);
      if (references.some(rows => rows.length > 0)) return "referenced";
      await tx.delete(familyMembersTable).where(eq(familyMembersTable.id, id));
      return "deleted";
    });
    if (deleted === "linked") {
      res.status(409).json({ error: "A linked adult cannot be deleted while its approved account is active" });
      return;
    }
    if (deleted === "referenced") {
      res.status(409).json({ error: "This family member has household history. Merge or reassign it before deleting." });
      return;
    }
    if (deleted === "missing") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete family member");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
