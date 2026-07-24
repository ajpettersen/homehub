import { Router } from "express";
import { db, userProfilesTable, familyMembersTable, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function formatProfile(
  profile: typeof userProfilesTable.$inferSelect,
  member: typeof familyMembersTable.$inferSelect | null,
  property: typeof propertiesTable.$inferSelect | null,
) {
  return {
    clerkId: profile.clerkId,
    role: profile.role,
    allowedPropertyId: profile.allowedPropertyId ? String(profile.allowedPropertyId) : null,
    allowedPropertyName: property?.name ?? null,
    linkedFamilyMemberId: profile.linkedFamilyMemberId ? String(profile.linkedFamilyMemberId) : null,
    linkedFamilyMemberName: member?.name ?? null,
    createdAt: profile.createdAt.toISOString(),
  };
}

/** GET /api/me — get or auto-create the current user's profile */
router.get("/me", async (req, res) => {
  const clerkId = req.auth?.userId;
  if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const rows = await db
      .select({ profile: userProfilesTable, member: familyMembersTable, property: propertiesTable })
      .from(userProfilesTable)
      .leftJoin(familyMembersTable, eq(userProfilesTable.linkedFamilyMemberId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(userProfilesTable.allowedPropertyId, propertiesTable.id))
      .where(eq(userProfilesTable.clerkId, clerkId));

    if (rows.length) {
      const { profile, member, property } = rows[0];
      return res.json(formatProfile(profile, member ?? null, property ?? null));
    }

    // First login — create a pending profile
    const [newProfile] = await db
      .insert(userProfilesTable)
      .values({ clerkId })
      .returning();

    res.status(201).json(formatProfile(newProfile, null, null));
  } catch (err) {
    req.log.error({ err }, "Failed to get/create user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /api/admin/users — list all profiles (family admin only) */
router.get("/admin/users", async (req, res) => {
  if (!req.auth?.userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const rows = await db
      .select({ profile: userProfilesTable, member: familyMembersTable, property: propertiesTable })
      .from(userProfilesTable)
      .leftJoin(familyMembersTable, eq(userProfilesTable.linkedFamilyMemberId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(userProfilesTable.allowedPropertyId, propertiesTable.id))
      .orderBy(userProfilesTable.createdAt);

    res.json(rows.map(({ profile, member, property }) =>
      formatProfile(profile, member ?? null, property ?? null),
    ));
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/admin/users/:targetClerkId — update role / property / linked member */
router.put("/admin/users/:targetClerkId", async (req, res) => {
  if (!req.auth?.userId) return res.status(401).json({ error: "Unauthorized" });

  const { targetClerkId } = req.params;
  const { role, allowedPropertyId, linkedFamilyMemberId } = req.body;

  try {
    await db
      .update(userProfilesTable)
      .set({
        ...(role !== undefined ? { role } : {}),
        ...(allowedPropertyId !== undefined
          ? { allowedPropertyId: allowedPropertyId ? Number(allowedPropertyId) : null }
          : {}),
        ...(linkedFamilyMemberId !== undefined
          ? { linkedFamilyMemberId: linkedFamilyMemberId ? Number(linkedFamilyMemberId) : null }
          : {}),
      })
      .where(eq(userProfilesTable.clerkId, targetClerkId));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
