import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { familyMembersTable, userProfilesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { getPropertyAuthorizationScope, type PropertyAuthorizationScope } from "../lib/propertyAuthorization";

const router = Router();

const VALID_ROLES = ["parent", "child", "pet"] as const;

async function requireHouseholdScope(
  req: any,
  res: any,
  familyAdminOnly = false,
): Promise<PropertyAuthorizationScope | null> {
  const clerkId = getAuth(req).userId;
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
    const scope = await requireHouseholdScope(req, res, true);
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
    const scope = await requireHouseholdScope(req, res, true);
    if (!scope) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { name, role, color, photoUrl, linkedAccountClerkId } = req.body ?? {};
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: "role must be parent | child | pet" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      updates.name = String(name).trim();
      updates.avatarInitials = String(name).trim().charAt(0).toUpperCase();
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

      const [linked] = await tx.select({ clerkId: userProfilesTable.clerkId })
        .from(userProfilesTable)
        .where(and(
          eq(userProfilesTable.householdId, scope.householdId),
          eq(userProfilesTable.linkedFamilyMemberId, id),
          eq(userProfilesTable.role, "family"),
        ))
        .for("update")
        .limit(1);

      if (current.role === "parent" && role !== undefined && role !== "parent" && linked) {
        throw Object.assign(new Error("A linked adult cannot be changed to a child or pet"), { status: 409 });
      }
      if (current.role !== "parent" && role === "parent") {
        if (typeof linkedAccountClerkId !== "string" || !linkedAccountClerkId) {
          throw Object.assign(new Error("Promoting an adult requires an approved unlinked family account"), { status: 400 });
        }
        const [eligible] = await tx.select({ clerkId: userProfilesTable.clerkId })
          .from(userProfilesTable)
          .where(and(
            eq(userProfilesTable.clerkId, linkedAccountClerkId),
            eq(userProfilesTable.householdId, scope.householdId),
            eq(userProfilesTable.role, "family"),
            sql`${userProfilesTable.linkedFamilyMemberId} IS NULL`,
          ))
          .for("update")
          .limit(1);
        if (!eligible) {
          throw Object.assign(new Error("That account is not eligible to link"), { status: 409 });
        }
        await tx.update(userProfilesTable)
          .set({ linkedFamilyMemberId: id })
          .where(eq(userProfilesTable.clerkId, eligible.clerkId));
      }

      const [updated] = await tx.update(familyMembersTable).set(updates).where(and(
        eq(familyMembersTable.id, id),
        eq(familyMembersTable.householdId, scope.householdId),
      )).returning();
      return { member: updated, linkedAccount: linked ?? (role === "parent" ? { clerkId: linkedAccountClerkId } : null) };
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
    const scope = await requireHouseholdScope(req, res, true);
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
        .where(and(
          eq(userProfilesTable.householdId, scope.householdId),
          eq(userProfilesTable.linkedFamilyMemberId, id),
          eq(userProfilesTable.role, "family"),
        )).limit(1);
      if (linked) return "linked";
      await tx.delete(familyMembersTable).where(eq(familyMembersTable.id, id));
      return "deleted";
    });
    if (deleted === "linked") {
      res.status(409).json({ error: "A linked adult cannot be deleted while its approved account is active" });
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
