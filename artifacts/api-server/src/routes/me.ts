import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, userProfilesTable, familyMembersTable, householdsTable, propertiesTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { isConfiguredBootstrapIdentity } from "../lib/bootstrapIdentity";

const router = Router();

function formatProfile(
  profile: typeof userProfilesTable.$inferSelect,
  member: typeof familyMembersTable.$inferSelect | null,
  property: typeof propertiesTable.$inferSelect | null,
) {
  return {
    clerkId: profile.clerkId,
    role: profile.role,
    householdId: profile.householdId ? String(profile.householdId) : null,
    allowedPropertyId: profile.allowedPropertyId ? String(profile.allowedPropertyId) : null,
    allowedPropertyName: property?.name ?? null,
    linkedFamilyMemberId: profile.linkedFamilyMemberId ? String(profile.linkedFamilyMemberId) : null,
    linkedFamilyMemberName: member?.name ?? null,
    createdAt: profile.createdAt.toISOString(),
  };
}

interface FamilyAdminScope {
  clerkId: string;
  householdId: number;
}

async function ensureBootstrapHousehold(tx: any): Promise<number> {
  const [existingHousehold] = await tx
    .select({ id: householdsTable.id })
    .from(householdsTable)
    .orderBy(asc(householdsTable.id))
    .limit(1);
  if (existingHousehold) return existingHousehold.id;

  const [createdHousehold] = await tx
    .insert(householdsTable)
    .values({ name: "HomeHub Household" })
    .returning({ id: householdsTable.id });
  return createdHousehold.id;
}

async function requireFamilyAdmin(req: any, res: any): Promise<FamilyAdminScope | null> {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const [profile] = await db
    .select({ role: userProfilesTable.role, householdId: userProfilesTable.householdId })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, clerkId))
    .limit(1);

  if (profile?.role !== "family" || !profile.householdId) {
    res.status(403).json({ error: "Family administrator access required" });
    return null;
  }

  return { clerkId, householdId: profile.householdId };
}

/** GET /api/me — get or auto-create the current user's profile */
router.get("/me", async (req, res): Promise<void> => {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await db
      .select({ profile: userProfilesTable, member: familyMembersTable, property: propertiesTable })
      .from(userProfilesTable)
      .leftJoin(familyMembersTable, eq(userProfilesTable.linkedFamilyMemberId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(userProfilesTable.allowedPropertyId, propertiesTable.id))
      .where(eq(userProfilesTable.clerkId, clerkId));

    if (rows.length) {
      const { profile, member, property } = rows[0];
      if (profile.role === "pending" && await isConfiguredBootstrapIdentity(clerkId)) {
        const [resolvedProfile] = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('homehub-user-profile-bootstrap'))`);
          const [currentProfile] = await tx
            .select()
            .from(userProfilesTable)
            .where(eq(userProfilesTable.clerkId, clerkId))
            .limit(1);

          if (currentProfile?.role === "pending") {
            const householdId = await ensureBootstrapHousehold(tx);
            return tx
              .update(userProfilesTable)
              .set({ role: "family", householdId })
              .where(eq(userProfilesTable.clerkId, clerkId))
              .returning();
          }

          return [currentProfile ?? profile];
        });
        res.json(formatProfile(resolvedProfile, member ?? null, property ?? null));
        return;
      }

      res.json(formatProfile(profile, member ?? null, property ?? null));
      return;
    }

    // Bootstrap only the explicitly configured household owner. All other
    // accounts remain pending until a family administrator grants access.
    const isBootstrapOwner = await isConfiguredBootstrapIdentity(clerkId);
    const [newProfile] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('homehub-user-profile-bootstrap'))`);
      const [existingProfile] = await tx
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.clerkId, clerkId))
        .limit(1);

      if (existingProfile) {
        if (isBootstrapOwner && existingProfile.role === "pending") {
          const householdId = await ensureBootstrapHousehold(tx);
          return tx
            .update(userProfilesTable)
            .set({ role: "family", householdId })
            .where(eq(userProfilesTable.clerkId, clerkId))
            .returning();
        }
        return [existingProfile];
      }

      const householdId = isBootstrapOwner ? await ensureBootstrapHousehold(tx) : null;
      return tx
        .insert(userProfilesTable)
        .values({
          clerkId,
          role: isBootstrapOwner ? "family" : "pending",
          householdId,
        })
        .returning();
    });

    res.status(201).json(formatProfile(newProfile, null, null));
  } catch (err) {
    req.log.error({ err }, "Failed to get/create user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /api/admin/users — list all profiles (family admin only) */
router.get("/admin/users", async (req, res) => {
  try {
    const admin = await requireFamilyAdmin(req, res);
    if (!admin) return;
    const rows = await db
      .select({ profile: userProfilesTable, member: familyMembersTable, property: propertiesTable })
      .from(userProfilesTable)
      .leftJoin(familyMembersTable, eq(userProfilesTable.linkedFamilyMemberId, familyMembersTable.id))
      .leftJoin(propertiesTable, eq(userProfilesTable.allowedPropertyId, propertiesTable.id))
      .where(eq(userProfilesTable.householdId, admin.householdId))
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
  const { targetClerkId } = req.params;
  const { role, allowedPropertyId, linkedFamilyMemberId } = req.body;

  try {
    const admin = await requireFamilyAdmin(req, res);
    if (!admin) return;
    if (role !== undefined && !["family", "cleaner", "pending"].includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    const [targetProfile] = await db
      .select({ householdId: userProfilesTable.householdId })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, targetClerkId))
      .limit(1);
    if (!targetProfile || targetProfile.householdId !== admin.householdId) {
      res.status(404).json({ error: "User profile not found" });
      return;
    }

    let normalizedPropertyId: number | null | undefined;
    if (allowedPropertyId !== undefined) {
      if (allowedPropertyId === null || allowedPropertyId === "") {
        normalizedPropertyId = null;
      } else {
        const propertyId = Number(allowedPropertyId);
        if (!Number.isInteger(propertyId)) {
          res.status(400).json({ error: "Invalid property" });
          return;
        }
        const [property] = await db
          .select({ id: propertiesTable.id })
          .from(propertiesTable)
          .where(and(
            eq(propertiesTable.id, propertyId),
            eq(propertiesTable.householdId, admin.householdId),
          ))
          .limit(1);
        if (!property) {
          res.status(403).json({ error: "Unauthorized property" });
          return;
        }
        normalizedPropertyId = propertyId;
      }
    }

    await db
      .update(userProfilesTable)
      .set({
        ...(role !== undefined ? { role } : {}),
        ...(allowedPropertyId !== undefined
          ? { allowedPropertyId: normalizedPropertyId ?? null }
          : {}),
        ...(linkedFamilyMemberId !== undefined
          ? { linkedFamilyMemberId: linkedFamilyMemberId ? Number(linkedFamilyMemberId) : null }
          : {}),
      })
      .where(and(
        eq(userProfilesTable.clerkId, targetClerkId),
        eq(userProfilesTable.householdId, admin.householdId),
      ));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
