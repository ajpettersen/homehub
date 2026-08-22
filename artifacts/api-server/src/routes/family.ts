import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { familyMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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
  if (!scope || (familyAdminOnly && scope.role !== "family")) {
    res.status(403).json({ error: familyAdminOnly ? "Family administrator access required" : "Household access required" });
    return null;
  }
  return scope;
}

function memberToJson(m: any) {
  return {
    id: String(m.id),
    name: m.name,
    role: m.role,
    color: m.color,
    photoUrl: m.photoUrl ?? null,
  };
}

router.get("/family-members", async (req, res) => {
  try {
    const scope = await requireHouseholdScope(req, res);
    if (!scope) return;
    const members = await db
      .select()
      .from(familyMembersTable)
      .where(eq(familyMembersTable.householdId, scope.householdId))
      .orderBy(familyMembersTable.id);
    res.json(members.map(memberToJson));
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
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: "role must be parent | child | pet" });
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

    const { name, role, color, photoUrl } = req.body ?? {};
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

    const [member] = await db
      .update(familyMembersTable)
      .set(updates)
      .where(and(
        eq(familyMembersTable.id, id),
        eq(familyMembersTable.householdId, scope.householdId),
      ))
      .returning();

    if (!member) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(memberToJson(member));
  } catch (err) {
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
    await db.delete(familyMembersTable).where(and(
      eq(familyMembersTable.id, id),
      eq(familyMembersTable.householdId, scope.householdId),
    ));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete family member");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
