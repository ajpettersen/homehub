import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { clerkClient, getAuth } from "@clerk/express";
import {
  choresTable,
  aiMemoriesTable,
  db,
  familyMembersTable,
  householdInvitesTable,
  householdJoinRequestsTable,
  HOMEHUB_WEB_TABS,
  householdsTable,
  propertiesTable,
  maintenanceTasksTable,
  mealRatingsTable,
  todoItemsTable,
  todoListsTable,
  userProfilesTable,
  workoutParticipantsTable,
  workoutsTable,
} from "@workspace/db";
import {
  GetMyFamilyProfileResponse,
  MergeDuplicateAdultBody,
  UpdateMyFamilyProfileBody,
  UpdateMyFamilyProfileResponse,
  CompletePersonalSetupBody,
  CompletePersonalSetupResponse,
} from "@workspace/api-zod";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { isConfiguredBootstrapIdentity } from "../lib/bootstrapIdentity";

const router = Router();

interface HouseholdSummary {
  name: string;
  onboardingCompletedAt: Date | null;
  visibleTabs: typeof householdsTable.$inferSelect.visibleTabs;
}

async function getHouseholdSummary(householdId: number | null): Promise<HouseholdSummary | null> {
  if (!householdId) return null;
  const [household] = await db
    .select({
      name: householdsTable.name,
      onboardingCompletedAt: householdsTable.onboardingCompletedAt,
      visibleTabs: householdsTable.visibleTabs,
    })
    .from(householdsTable)
    .where(eq(householdsTable.id, householdId))
    .limit(1);
  return household ?? null;
}

function formatProfile(
  profile: typeof userProfilesTable.$inferSelect,
  member: typeof familyMembersTable.$inferSelect | null,
  property: typeof propertiesTable.$inferSelect | null,
  household: HouseholdSummary | null,
) {
  const isPending = profile.role === "pending";
  return {
    clerkId: profile.clerkId,
    role: profile.role,
    isAdmin: !isPending && profile.isAdmin,
    householdId: isPending ? null : profile.householdId ? String(profile.householdId) : null,
    householdName: isPending ? null : household?.name ?? null,
    onboardingCompleted: !isPending && household ? household.onboardingCompletedAt !== null : false,
    needsPersonalSetup: !isPending
      && profile.role === "family"
      && member?.role === "parent"
      && member.householdId === profile.householdId
      && profile.personalSetupCompletedAt === null,
    visibleTabs: isPending ? [] : household?.visibleTabs ?? [...HOMEHUB_WEB_TABS],
    allowedPropertyId: isPending ? null : profile.allowedPropertyId ? String(profile.allowedPropertyId) : null,
    allowedPropertyName: isPending ? null : property?.name ?? null,
    linkedFamilyMemberId: isPending ? null : profile.linkedFamilyMemberId ? String(profile.linkedFamilyMemberId) : null,
    linkedFamilyMemberName: isPending ? null : member?.name ?? null,
    createdAt: profile.createdAt.toISOString(),
  };
}

interface FamilyAdminScope {
  clerkId: string;
  householdId: number;
}

interface ApprovedAdultScope {
  clerkId: string;
  householdId: number;
}

function selfFamilyProfileJson(member: typeof familyMembersTable.$inferSelect) {
  return {
    id: String(member.id),
    name: member.name,
    color: member.color,
    photoUrl: member.photoUrl ?? null,
  };
}

function isSafeProfilePhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && value.length <= 2048;
  } catch {
    return false;
  }
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

function clerkIdentityDisplayName(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): string {
  const verifiedEmail = user.emailAddresses.find(email => email.verification?.status === "verified")?.emailAddress;
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    || user.username
    || verifiedEmail?.split("@")[0]
    || "Household administrator";
}

async function ensureBootstrapAdult(
  tx: any,
  profile: typeof userProfilesTable.$inferSelect,
  displayName: string,
) {
  if (!profile.householdId || profile.role !== "family") return profile;
  if (profile.linkedFamilyMemberId) {
    const [validMember] = await tx.select({ id: familyMembersTable.id })
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.id, profile.linkedFamilyMemberId),
        eq(familyMembersTable.householdId, profile.householdId),
        eq(familyMembersTable.role, "parent"),
      )).limit(1);
    if (validMember) return profile;
  }
  const [member] = await tx.insert(familyMembersTable).values({
    householdId: profile.householdId,
    name: displayName,
    role: "parent",
    color: "#C1440E",
    avatarInitials: displayName.charAt(0).toUpperCase(),
    photoUrl: null,
  }).returning();
  const [updated] = await tx.update(userProfilesTable)
    .set({ linkedFamilyMemberId: member.id })
    .where(eq(userProfilesTable.clerkId, profile.clerkId))
    .returning();
  return updated ?? profile;
}

async function requireFamilyAdmin(req: any, res: any): Promise<FamilyAdminScope | null> {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const [profile] = await db
    .select({ role: userProfilesTable.role, isAdmin: userProfilesTable.isAdmin, householdId: userProfilesTable.householdId })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, clerkId))
    .limit(1);

  if (profile?.role !== "family" || !profile.isAdmin || !profile.householdId) {
    res.status(403).json({ error: "Family administrator access required" });
    return null;
  }

  return { clerkId, householdId: profile.householdId };
}

/** An approved family account may manage joining only when linked to its household's parent profile. */
async function requireApprovedAdult(req: any, res: any): Promise<ApprovedAdultScope | null> {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [profile] = await db
    .select({
      householdId: userProfilesTable.householdId,
      role: userProfilesTable.role,
      linkedFamilyMemberId: userProfilesTable.linkedFamilyMemberId,
    })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, clerkId))
    .limit(1);
  if (!profile?.householdId || profile.role !== "family" || !profile.linkedFamilyMemberId) {
    res.status(403).json({ error: "An approved adult family account is required" });
    return null;
  }
  const [member] = await db.select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.id, profile.linkedFamilyMemberId),
      eq(familyMembersTable.householdId, profile.householdId),
      eq(familyMembersTable.role, "parent"),
    ))
    .limit(1);
  if (!member) {
    res.status(403).json({ error: "An approved adult family account is required" });
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
      if (profile.role === "pending") {
        const isBootstrapOwner = await isConfiguredBootstrapIdentity(clerkId);
        if (!isBootstrapOwner) {
          res.json(formatProfile(
            profile,
            member ?? null,
            property ?? null,
            await getHouseholdSummary(profile.householdId),
          ));
          return;
        }

        const bootstrapUser = await clerkClient.users.getUser(clerkId);
        const [resolvedProfile] = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('homehub-user-profile-bootstrap'))`);
          const [currentProfile] = await tx
            .select()
            .from(userProfilesTable)
            .where(eq(userProfilesTable.clerkId, clerkId))
            .limit(1);

          if (currentProfile?.role === "pending" && isBootstrapOwner) {
            const householdId = currentProfile.householdId ?? await ensureBootstrapHousehold(tx);
            const [promoted] = await tx
              .update(userProfilesTable)
              .set({
                role: "family",
                isAdmin: true,
                householdId,
              })
              .where(eq(userProfilesTable.clerkId, clerkId))
              .returning();
            return [await ensureBootstrapAdult(tx, promoted, clerkIdentityDisplayName(bootstrapUser))];
          }

          return [currentProfile ?? profile];
        });
        res.json(formatProfile(
          resolvedProfile,
          member ?? null,
          property ?? null,
          await getHouseholdSummary(resolvedProfile.householdId),
        ));
        return;
      }

      if (await isConfiguredBootstrapIdentity(clerkId)) {
        const bootstrapUser = await clerkClient.users.getUser(clerkId);
        const resolvedProfile = await db.transaction(async (tx) => {
          const [locked] = await tx.select().from(userProfilesTable)
            .where(eq(userProfilesTable.clerkId, clerkId)).for("update").limit(1);
          return ensureBootstrapAdult(tx, locked, clerkIdentityDisplayName(bootstrapUser));
        });
        const [resolvedMember] = resolvedProfile.linkedFamilyMemberId
          ? await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, resolvedProfile.linkedFamilyMemberId)).limit(1)
          : [null];
        res.json(formatProfile(
          resolvedProfile,
          resolvedMember ?? null,
          property ?? null,
          await getHouseholdSummary(resolvedProfile.householdId),
        ));
        return;
      }

      res.json(formatProfile(
        profile,
        member ?? null,
        property ?? null,
        await getHouseholdSummary(profile.householdId),
      ));
      return;
    }

    // Bootstrap only the explicitly configured household owner. All other
    // accounts remain pending until a family administrator grants access.
    const isBootstrapOwner = await isConfiguredBootstrapIdentity(clerkId);
    const bootstrapUser = isBootstrapOwner ? await clerkClient.users.getUser(clerkId) : null;
    const [newProfile] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('homehub-user-profile-bootstrap'))`);
      const [existingProfile] = await tx
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.clerkId, clerkId))
        .limit(1);

      if (existingProfile) {
        if (existingProfile.role === "pending" && isBootstrapOwner) {
          const householdId = existingProfile.householdId ?? await ensureBootstrapHousehold(tx);
          const [promoted] = await tx
            .update(userProfilesTable)
            .set({
              role: "family",
              isAdmin: true,
              householdId,
            })
            .where(eq(userProfilesTable.clerkId, clerkId))
            .returning();
          return [await ensureBootstrapAdult(tx, promoted, clerkIdentityDisplayName(bootstrapUser!))];
        }
        return [existingProfile];
      }

      const householdId = isBootstrapOwner ? await ensureBootstrapHousehold(tx) : null;
      const [created] = await tx
        .insert(userProfilesTable)
        .values({
          clerkId,
          role: isBootstrapOwner ? "family" : "pending",
          isAdmin: isBootstrapOwner,
          householdId,
        })
        .returning();
      return [isBootstrapOwner
        ? await ensureBootstrapAdult(tx, created, clerkIdentityDisplayName(bootstrapUser!))
        : created];
    });

    res.status(201).json(formatProfile(
      newProfile,
      null,
      null,
      await getHouseholdSummary(newProfile.householdId),
    ));
  } catch (err) {
    req.log.error({ err }, "Failed to get/create user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /api/me/family-profile — get only the signed-in family account's linked adult */
router.get("/me/family-profile", async (req, res): Promise<void> => {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const [profile] = await db
      .select({
        role: userProfilesTable.role,
        householdId: userProfilesTable.householdId,
        linkedFamilyMemberId: userProfilesTable.linkedFamilyMemberId,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, clerkId))
      .limit(1);

    if (!profile || profile.role !== "family") {
      res.status(403).json({ error: "An approved family account is required to view this profile" });
      return;
    }
    if (!profile.householdId || !profile.linkedFamilyMemberId) {
      res.status(409).json({ error: "Your family account is not linked to an adult profile; ask a household administrator to repair the link" });
      return;
    }

    const [member] = await db
      .select()
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.id, profile.linkedFamilyMemberId),
        eq(familyMembersTable.householdId, profile.householdId),
      ))
      .limit(1);
    if (!member) {
      res.status(404).json({ error: "Your linked family profile was not found in this household; ask a household administrator to relink it" });
      return;
    }
    if (member.role !== "parent") {
      res.status(409).json({ error: "Your linked family profile is not an adult profile; ask a household administrator to repair the link" });
      return;
    }
    if (member.photoUrl !== null && !isSafeProfilePhotoUrl(member.photoUrl)) {
      res.status(409).json({ error: "Your linked family profile has an invalid photo URL; update or remove it through a household administrator" });
      return;
    }

    res.json(GetMyFamilyProfileResponse.parse(selfFamilyProfileJson(member)));
  } catch (err) {
    req.log.error({ err }, "Failed to get own family profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /api/me/family-profile — update only the signed-in family account's linked adult */
router.patch("/me/family-profile", async (req, res): Promise<void> => {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = UpdateMyFamilyProfileBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid family profile fields: ${parsed.error.message}` });
    return;
  }
  if (!Object.keys(parsed.data).length) {
    res.status(400).json({ error: "Provide at least one of name, color, or photoUrl" });
    return;
  }

  const updates: { name?: string; avatarInitials?: string; color?: string; photoUrl?: string | null } = {};
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim();
    if (!name || name.length > 100) {
      res.status(400).json({ error: "name must contain 1 to 100 non-whitespace characters" });
      return;
    }
    updates.name = name;
    updates.avatarInitials = name.charAt(0).toUpperCase();
  }
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.photoUrl !== undefined) {
    if (parsed.data.photoUrl !== null && !isSafeProfilePhotoUrl(parsed.data.photoUrl)) {
      res.status(400).json({ error: "photoUrl must be a valid http or https URL no longer than 2048 characters" });
      return;
    }
    updates.photoUrl = parsed.data.photoUrl;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.clerkId, clerkId))
        .for("update")
        .limit(1);
      if (!profile || profile.role !== "family") return { status: "forbidden" } as const;
      if (!profile.householdId || !profile.linkedFamilyMemberId) return { status: "unlinked" } as const;

      const householdId = profile.householdId;
      const memberId = profile.linkedFamilyMemberId;
      const [member] = await tx
        .select()
        .from(familyMembersTable)
        .where(and(
          eq(familyMembersTable.id, memberId),
          eq(familyMembersTable.householdId, householdId),
        ))
        .for("update")
        .limit(1);
      if (!member) return { status: "missing" } as const;
      if (member.role !== "parent") return { status: "invalid-link" } as const;

      const [updated] = await tx
        .update(familyMembersTable)
        .set(updates)
        .where(and(
          eq(familyMembersTable.id, memberId),
          eq(familyMembersTable.householdId, householdId),
          eq(familyMembersTable.role, "parent"),
        ))
        .returning();
      if (!updated) return { status: "relinked" } as const;
      return { status: "ok", member: updated } as const;
    });

    if (result.status === "forbidden") {
      res.status(403).json({ error: "An approved family account is required to update this profile" });
      return;
    }
    if (result.status === "unlinked") {
      res.status(409).json({ error: "Your family account is not linked to an adult profile; ask a household administrator to repair the link" });
      return;
    }
    if (result.status === "missing") {
      res.status(404).json({ error: "Your linked family profile was not found in this household; ask a household administrator to relink it" });
      return;
    }
    if (result.status === "invalid-link") {
      res.status(409).json({ error: "Your linked family profile is not an adult profile; ask a household administrator to repair the link" });
      return;
    }
    if (result.status === "relinked") {
      res.status(409).json({ error: "Your family profile link changed while it was being updated; refresh and try again" });
      return;
    }

    res.json(UpdateMyFamilyProfileResponse.parse(selfFamilyProfileJson(result.member)));
  } catch (err) {
    req.log.error({ err }, "Failed to update own family profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/me/personal-setup — complete setup for only the caller's linked adult. */
router.post("/me/personal-setup", async (req, res): Promise<void> => {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = CompletePersonalSetupBody.strict().safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid personal setup fields: ${parsed.error.message}` });
    return;
  }
  const updates: { name?: string; avatarInitials?: string; color?: string; photoUrl?: string | null } = {};
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim();
    if (!name || name.length > 100) {
      res.status(400).json({ error: "name must contain 1 to 100 non-whitespace characters" });
      return;
    }
    updates.name = name;
    updates.avatarInitials = name.charAt(0).toUpperCase();
  }
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.photoUrl !== undefined) {
    if (parsed.data.photoUrl !== null && !isSafeProfilePhotoUrl(parsed.data.photoUrl)) {
      res.status(400).json({ error: "photoUrl must be a valid http or https URL no longer than 2048 characters" });
      return;
    }
    updates.photoUrl = parsed.data.photoUrl;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [profile] = await tx.select().from(userProfilesTable)
        .where(eq(userProfilesTable.clerkId, clerkId)).for("update").limit(1);
      if (!profile || profile.role !== "family") return { status: "forbidden" } as const;
      if (!profile.householdId || !profile.linkedFamilyMemberId) return { status: "unlinked" } as const;
      const [member] = await tx.select().from(familyMembersTable).where(and(
        eq(familyMembersTable.id, profile.linkedFamilyMemberId),
        eq(familyMembersTable.householdId, profile.householdId),
        eq(familyMembersTable.role, "parent"),
      )).for("update").limit(1);
      if (!member) return { status: "unlinked" } as const;
      if (profile.personalSetupCompletedAt) {
        return { status: "ok", member, alreadyCompleted: true } as const;
      }
      const [updatedMember] = Object.keys(updates).length
        ? await tx.update(familyMembersTable).set(updates).where(and(
            eq(familyMembersTable.id, member.id),
            eq(familyMembersTable.householdId, profile.householdId),
            eq(familyMembersTable.role, "parent"),
          )).returning()
        : [member];
      if (!updatedMember) return { status: "unlinked" } as const;
      await tx.update(userProfilesTable)
        .set({ personalSetupCompletedAt: new Date() })
        .where(and(
          eq(userProfilesTable.clerkId, clerkId),
          eq(userProfilesTable.linkedFamilyMemberId, member.id),
          eq(userProfilesTable.householdId, profile.householdId),
        ));
      return { status: "ok", member: updatedMember, alreadyCompleted: false } as const;
    });
    if (result.status === "forbidden") {
      res.status(403).json({ error: "An approved family account is required" });
      return;
    }
    if (result.status === "unlinked") {
      res.status(409).json({ error: "Your account is not linked to an adult in this household" });
      return;
    }
    res.json(CompletePersonalSetupResponse.parse({
      profile: selfFamilyProfileJson(result.member),
      alreadyCompleted: result.alreadyCompleted,
    }));
  } catch (err) {
    req.log.error({ err }, "Failed to complete personal setup");
    res.status(500).json({ error: "Internal server error" });
  }
});

const JOIN_ATTEMPT_LIMIT = 5;
const JOIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const JOIN_RESPONSE_MINIMUM_MS = 1000;
const JOIN_RESPONSE_JITTER_MS = 150;

function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function claimJoinAttempt(clerkId: string, clientIp: string): Promise<boolean> {
  const requesterHash = hashRateLimitKey(clerkId);
  const clientIpHash = hashRateLimitKey(clientIp);
  const result = await db.execute(sql`
    INSERT INTO join_request_rate_limits (
      requester_hash, client_ip_hash, window_started_at, attempt_count
    ) VALUES (${requesterHash}, ${clientIpHash}, now(), 1)
    ON CONFLICT (requester_hash, client_ip_hash) DO UPDATE
    SET attempt_count = CASE
          WHEN join_request_rate_limits.window_started_at <= now() - (${JOIN_ATTEMPT_WINDOW_MS} * interval '1 millisecond') THEN 1
          ELSE join_request_rate_limits.attempt_count + 1
        END,
        window_started_at = CASE
          WHEN join_request_rate_limits.window_started_at <= now() - (${JOIN_ATTEMPT_WINDOW_MS} * interval '1 millisecond') THEN now()
          ELSE join_request_rate_limits.window_started_at
        END
    RETURNING attempt_count
  `);
  const attemptCount = Number((result.rows[0] as { attempt_count: unknown } | undefined)?.attempt_count);
  return attemptCount <= JOIN_ATTEMPT_LIMIT;
}

async function padJoinResponse(startedAt: number): Promise<void> {
  const target = JOIN_RESPONSE_MINIMUM_MS
    + Math.floor(Math.random() * (JOIN_RESPONSE_JITTER_MS + 1));
  const remaining = target - (Date.now() - startedAt);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
}

/** POST /api/me/join-request — silently create a reviewable request when eligible */
router.post("/me/join-request", async (req, res): Promise<void> => {
  const startedAt = Date.now();
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const accepted = async () => {
    await padJoinResponse(startedAt);
    res.status(200).json({ accepted: true });
  };

  // administratorEmail remains accepted for deployed clients. New clients use
  // householdMemberEmail because any approved adult can be the target.
  const householdMemberEmail =
    typeof req.body?.householdMemberEmail === "string"
      ? req.body.householdMemberEmail.trim().toLowerCase()
      : typeof req.body?.administratorEmail === "string"
        ? req.body.administratorEmail.trim().toLowerCase()
      : "";
  if (
    householdMemberEmail.length < 3 ||
    householdMemberEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(householdMemberEmail)
  ) {
    res.status(400).json({ error: "Enter a valid household member email." });
    return;
  }

  try {
    const rateAllowed = await claimJoinAttempt(clerkId, req.ip || "unknown");
    const requester = await clerkClient.users.getUser(clerkId).catch(() => null);
    const users = await clerkClient.users.getUserList({
       emailAddress: [householdMemberEmail],
      limit: 2,
    }).catch(() => ({ data: [] }));
    const householdMember = users.data.length === 1 ? users.data[0] : null;
    // Always perform this lookup, including self and unknown identities.
    const [householdMemberProfile] = await db
      .select({
        householdId: userProfilesTable.householdId,
        role: userProfilesTable.role,
        linkedFamilyMemberId: userProfilesTable.linkedFamilyMemberId,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, householdMember?.id ?? "__no_matching_clerk_user__"))
      .limit(1);
    const targetHasVerifiedEmail = householdMember?.emailAddresses.some(
      email => email.verification?.status === "verified"
        && email.emailAddress.trim().toLowerCase() === householdMemberEmail,
    ) ?? false;
    const [targetAdult] = householdMemberProfile?.householdId && householdMemberProfile.linkedFamilyMemberId
      ? await db.select({ id: familyMembersTable.id }).from(familyMembersTable).where(and(
        eq(familyMembersTable.id, householdMemberProfile.linkedFamilyMemberId),
        eq(familyMembersTable.householdId, householdMemberProfile.householdId),
        eq(familyMembersTable.role, "parent"),
      )).limit(1)
      : [null];
    const verifiedEmail = requester?.emailAddresses.find(
      email => email.verification?.status === "verified",
    )?.emailAddress ?? null;
    const requesterDisplayName = [requester?.firstName, requester?.lastName]
      .filter(Boolean)
      .join(" ")
      || requester?.username
      || verifiedEmail?.split("@")[0]
      || "HomeHub member";
    const eligible = rateAllowed
       && householdMember?.id !== clerkId
       && targetHasVerifiedEmail
       && householdMemberProfile?.role === "family"
       && !!targetAdult
       && !!householdMemberProfile.householdId
      && !!verifiedEmail;

    await db.transaction(async (tx) => {
      // This lock is shared with decisions so a retry cannot retarget a request
      // between its row lock and the final profile/status transition.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`homehub-join-request:${clerkId}`}))`);
      const [existingRequest] = await tx
        .select()
        .from(householdJoinRequestsTable)
        .where(eq(householdJoinRequestsTable.requesterClerkId, clerkId))
        .for("update")
        .limit(1);
      await tx
        .insert(userProfilesTable)
        .values({ clerkId, role: "pending", householdId: null })
        .onConflictDoNothing({ target: userProfilesTable.clerkId });

      const [profile] = await tx
        .select({ householdId: userProfilesTable.householdId, role: userProfilesTable.role })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.clerkId, clerkId))
        .for("update")
        .limit(1);
      if (!eligible || profile?.role !== "pending" || profile.householdId) return;

      const values = {
          requesterClerkId: clerkId,
           targetHouseholdId: householdMemberProfile.householdId!,
          requesterDisplayName,
          requesterEmail: verifiedEmail!,
          status: "pending",
          updatedAt: new Date(),
          decidedAt: null,
        };
      if (existingRequest) {
        await tx.update(householdJoinRequestsTable).set({
            targetHouseholdId: householdMemberProfile.householdId!,
            requesterDisplayName,
            requesterEmail: verifiedEmail!,
            status: "pending",
            updatedAt: new Date(),
            decidedAt: null,
          }).where(eq(householdJoinRequestsTable.id, existingRequest.id));
      } else {
        await tx.insert(householdJoinRequestsTable).values(values);
      }
    });
    await accepted();
  } catch (err) {
    req.log.error({ err }, "Failed to submit household join request");
    await accepted();
  }
});

const HOUSEHOLD_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function inviteJson(invite: typeof householdInvitesTable.$inferSelect) {
  return {
    id: String(invite.id),
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

/** POST /api/me/household-invites — create a single-use 24 hour household invite. */
router.post("/me/household-invites", async (req, res): Promise<void> => {
  try {
    const adult = await requireApprovedAdult(req, res);
    if (!adult) return;
    const token = randomBytes(32).toString("base64url");
    const [invite] = await db.insert(householdInvitesTable).values({
      householdId: adult.householdId,
      createdByClerkId: adult.clerkId,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + HOUSEHOLD_INVITE_TTL_MS),
    }).returning();
    // This is the only response that contains the bearer token.
    res.status(201).json({ ...inviteJson(invite), token });
  } catch (err) {
    req.log.error({ err }, "Failed to create household invite");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /api/me/household-invites — list only active invites in the actor's household. */
router.get("/me/household-invites", async (req, res): Promise<void> => {
  try {
    const adult = await requireApprovedAdult(req, res);
    if (!adult) return;
    const invites = await db.select().from(householdInvitesTable).where(and(
      eq(householdInvitesTable.householdId, adult.householdId),
      isNull(householdInvitesTable.revokedAt),
      isNull(householdInvitesTable.redeemedAt),
      gt(householdInvitesTable.expiresAt, new Date()),
    )).orderBy(asc(householdInvitesTable.expiresAt));
    res.json(invites.map(inviteJson));
  } catch (err) {
    req.log.error({ err }, "Failed to list household invites");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/me/household-invites/:inviteId/revoke — revoke an active household invite. */
router.post("/me/household-invites/:inviteId/revoke", async (req, res): Promise<void> => {
  const inviteId = Number(req.params.inviteId);
  if (!Number.isInteger(inviteId)) {
    res.status(400).json({ error: "Invalid household invite" });
    return;
  }
  try {
    const adult = await requireApprovedAdult(req, res);
    if (!adult) return;
    const revoked = await db.update(householdInvitesTable).set({ revokedAt: new Date() }).where(and(
      eq(householdInvitesTable.id, inviteId),
      eq(householdInvitesTable.householdId, adult.householdId),
      isNull(householdInvitesTable.revokedAt),
      isNull(householdInvitesTable.redeemedAt),
      gt(householdInvitesTable.expiresAt, new Date()),
    )).returning({ id: householdInvitesTable.id });
    if (!revoked.length) {
      res.status(404).json({ error: "Active household invite not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to revoke household invite");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Public, deliberately minimal invite preflight. Tokens are body-only to keep them out of URLs. */
router.post("/me/household-invites/validate", async (req, res): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token || token.length < 32 || token.length > 128) {
    res.json({ valid: false });
    return;
  }
  try {
    const [invite] = await db.select({ id: householdInvitesTable.id }).from(householdInvitesTable).where(and(
      eq(householdInvitesTable.tokenHash, hashInviteToken(token)),
      isNull(householdInvitesTable.revokedAt),
      isNull(householdInvitesTable.redeemedAt),
      gt(householdInvitesTable.expiresAt, new Date()),
    )).limit(1);
    res.json({ valid: !!invite });
  } catch (err) {
    req.log.error({ err }, "Failed to validate household invite");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Redeem an invite once for the authenticated Clerk user and create its parent link if needed. */
router.post("/me/household-invites/redeem", async (req, res): Promise<void> => {
  const clerkId = getAuth(req).userId;
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!token || token.length < 32 || token.length > 128) {
    res.status(404).json({ error: "Household invite not found" });
    return;
  }
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    if (!clerkUser.emailAddresses.some(email => email.verification?.status === "verified")) {
      res.status(403).json({ error: "A verified Clerk email is required to redeem a household invite" });
      return;
    }
    const displayName = clerkIdentityDisplayName(clerkUser);
    const result = await db.transaction(async (tx) => {
      const [invite] = await tx.select().from(householdInvitesTable)
        .where(eq(householdInvitesTable.tokenHash, hashInviteToken(token))).for("update").limit(1);
      if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) return { status: "invalid" } as const;

      await tx.insert(userProfilesTable).values({ clerkId, role: "pending", householdId: null })
        .onConflictDoNothing({ target: userProfilesTable.clerkId });
      const [profile] = await tx.select().from(userProfilesTable)
        .where(eq(userProfilesTable.clerkId, clerkId)).for("update").limit(1);
      if (!profile) return { status: "invalid" } as const;
      if (profile.householdId && profile.householdId !== invite.householdId) return { status: "cross-household" } as const;
      if (invite.redeemedAt && invite.redeemedByClerkId !== clerkId) return { status: "used" } as const;

      const [member] = profile.linkedFamilyMemberId
        ? await tx.select({ id: familyMembersTable.id }).from(familyMembersTable).where(and(
          eq(familyMembersTable.id, profile.linkedFamilyMemberId),
          eq(familyMembersTable.householdId, invite.householdId),
          eq(familyMembersTable.role, "parent"),
        )).limit(1)
        : [null];
      const memberId = member?.id ?? (await tx.insert(familyMembersTable).values({
        householdId: invite.householdId,
        name: displayName,
        role: "parent",
        color: "#2D6A4F",
        avatarInitials: displayName.charAt(0).toUpperCase(),
        photoUrl: null,
      }).returning({ id: familyMembersTable.id }))[0].id;
      await tx.update(userProfilesTable).set({
        householdId: invite.householdId,
        role: "family",
        isAdmin: false,
        linkedFamilyMemberId: memberId,
      }).where(eq(userProfilesTable.clerkId, clerkId));
      await tx.update(householdInvitesTable).set({
        redeemedAt: invite.redeemedAt ?? new Date(),
        redeemedByClerkId: clerkId,
      }).where(eq(householdInvitesTable.id, invite.id));
      return { status: "ok", householdId: invite.householdId } as const;
    });
    if (result.status === "invalid" || result.status === "used") {
      res.status(404).json({ error: "Household invite not found" });
      return;
    }
    if (result.status === "cross-household") {
      res.status(409).json({ error: "This account is already linked to another household" });
      return;
    }
    res.json({ ok: true, householdId: String(result.householdId) });
  } catch (err) {
    req.log.error({ err }, "Failed to redeem household invite");
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

    const household = await getHouseholdSummary(admin.householdId);
    res.json(rows.map(({ profile, member, property }) =>
      formatProfile(profile, member ?? null, property ?? null, household),
    ));
  } catch (err) {
    req.log.error({ err }, "Failed to list users");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /api/admin/join-requests — pending requests are visible to approved household adults */
router.get("/admin/join-requests", async (req, res) => {
  try {
    const adult = await requireApprovedAdult(req, res);
    if (!adult) return;
    const requests = await db
      .select({
        id: householdJoinRequestsTable.id,
        requesterDisplayName: householdJoinRequestsTable.requesterDisplayName,
        requesterEmail: householdJoinRequestsTable.requesterEmail,
        createdAt: householdJoinRequestsTable.createdAt,
      })
      .from(householdJoinRequestsTable)
      .where(and(
        eq(householdJoinRequestsTable.targetHouseholdId, adult.householdId),
        eq(householdJoinRequestsTable.status, "pending"),
      ))
      .orderBy(householdJoinRequestsTable.createdAt);
    res.json(requests.map(request => ({
      ...request,
      id: String(request.id),
      createdAt: request.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list household join requests");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/admin/join-requests/:requestId — approved adults decide and atomically provision a member */
router.put("/admin/join-requests/:requestId", async (req, res) => {
  const requestId = Number(req.params.requestId);
  const { decision, linkedFamilyMemberId } = req.body;
  if (!Number.isInteger(requestId) || !["approved", "denied"].includes(decision)) {
    res.status(400).json({ error: "Invalid join request decision" });
    return;
  }
  try {
    const adult = await requireApprovedAdult(req, res);
    if (!adult) return;

    let memberId: number | null = null;
    if (decision === "approved" && linkedFamilyMemberId !== undefined && linkedFamilyMemberId !== null && linkedFamilyMemberId !== "") {
      memberId = Number(linkedFamilyMemberId);
      if (!Number.isInteger(memberId)) {
        res.status(400).json({ error: "Invalid family member" });
        return;
      }
    }

    const [candidate] = await db.select({ requesterClerkId: householdJoinRequestsTable.requesterClerkId })
      .from(householdJoinRequestsTable)
      .where(and(
        eq(householdJoinRequestsTable.id, requestId),
        eq(householdJoinRequestsTable.targetHouseholdId, adult.householdId),
        eq(householdJoinRequestsTable.status, "pending"),
      ))
      .limit(1);
    if (!candidate) {
      res.status(404).json({ error: "Join request not found" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      // Acquire the same requester-keyed lock as resubmission before locking
      // the request row, preventing retargeting during a decision.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`homehub-join-request:${candidate.requesterClerkId}`}))`);
      const [request] = await tx.select().from(householdJoinRequestsTable).where(and(
        eq(householdJoinRequestsTable.id, requestId),
        eq(householdJoinRequestsTable.targetHouseholdId, adult.householdId),
        eq(householdJoinRequestsTable.status, "pending"),
      )).for("update").limit(1);
      if (!request) return "missing" as const;
      // Lock the requester before creating a member. Invite redemption and a
      // competing approval lock this same row, so an already-linked account
      // cannot leave behind an orphaned member.
      const [requesterProfile] = await tx.select({
        role: userProfilesTable.role,
        householdId: userProfilesTable.householdId,
      }).from(userProfilesTable).where(eq(userProfilesTable.clerkId, request.requesterClerkId))
        .for("update").limit(1);
      if (!requesterProfile || requesterProfile.role !== "pending" || requesterProfile.householdId) {
        return "missing" as const;
      }

      if (decision === "denied") {
        await tx.update(householdJoinRequestsTable)
          .set({ status: "denied", updatedAt: new Date(), decidedAt: new Date() })
          .where(eq(householdJoinRequestsTable.id, request.id));
        return "ok" as const;
      }

      let approvedMemberId = memberId;
      if (approvedMemberId !== null) {
        const [selectedMember] = await tx.select({ id: familyMembersTable.id, role: familyMembersTable.role })
          .from(familyMembersTable)
          .where(and(
            eq(familyMembersTable.id, approvedMemberId),
             eq(familyMembersTable.householdId, adult.householdId),
          ))
          .for("update")
          .limit(1);
        if (!selectedMember || selectedMember.role !== "parent") return "ineligible-member" as const;
        const [existingLink] = await tx.select({ id: userProfilesTable.id })
          .from(userProfilesTable)
          .where(eq(userProfilesTable.linkedFamilyMemberId, approvedMemberId))
          .limit(1);
        if (existingLink) return "ineligible-member" as const;
      } else {
        const name = request.requesterDisplayName.trim()
          || request.requesterEmail.split("@")[0]
          || "HomeHub member";
        const [createdMember] = await tx.insert(familyMembersTable).values({
           householdId: adult.householdId,
          name,
          role: "parent",
          color: "#2D6A4F",
          avatarInitials: name.charAt(0).toUpperCase(),
          photoUrl: null,
        }).returning({ id: familyMembersTable.id });
        approvedMemberId = createdMember.id;
      }

      const attached = await tx.update(userProfilesTable)
        .set({
           householdId: adult.householdId,
          role: "family",
          isAdmin: false,
          linkedFamilyMemberId: approvedMemberId,
        })
        .where(and(
          eq(userProfilesTable.clerkId, request.requesterClerkId),
          eq(userProfilesTable.role, "pending"),
          sql`${userProfilesTable.householdId} IS NULL`,
        ))
        .returning({ clerkId: userProfilesTable.clerkId });
      if (!attached.length) return "missing" as const;

      await tx.update(householdJoinRequestsTable)
        .set({ status: "approved", updatedAt: new Date(), decidedAt: new Date() })
        .where(eq(householdJoinRequestsTable.id, request.id));
      return "ok" as const;
    });
    if (result === "missing") {
      res.status(404).json({ error: "Join request not found" });
      return;
    }
    if (result === "ineligible-member") {
      res.status(409).json({ error: "The selected adult is not an unlinked member of this household" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to decide household join request");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/admin/users/:targetClerkId — update role / property / linked member */
router.put("/admin/users/:targetClerkId", async (req, res) => {
  const { targetClerkId } = req.params;
  const { role, isAdmin, allowedPropertyId, linkedFamilyMemberId } = req.body;

  try {
    const admin = await requireFamilyAdmin(req, res);
    if (!admin) return;
    if (typeof isAdmin !== "undefined" && typeof isAdmin !== "boolean") {
      res.status(400).json({ error: "Invalid administrator status" });
      return;
    }
    if (targetClerkId === admin.clerkId && ((role !== undefined && role !== "family") || isAdmin === false)) {
      res.status(400).json({ error: "You cannot remove your own administrator access" });
      return;
    }
    if (role !== undefined && !["family", "cleaner", "pending"].includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    const [targetProfile] = await db
      .select({
        householdId: userProfilesTable.householdId,
        role: userProfilesTable.role,
        linkedFamilyMemberId: userProfilesTable.linkedFamilyMemberId,
      })
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

    let normalizedLinkedFamilyMemberId: number | null | undefined;
    if (linkedFamilyMemberId !== undefined) {
      if (linkedFamilyMemberId === null || linkedFamilyMemberId === "") {
        normalizedLinkedFamilyMemberId = null;
      } else {
        const familyMemberId = Number(linkedFamilyMemberId);
        if (!Number.isInteger(familyMemberId)) {
          res.status(400).json({ error: "Invalid family member" });
          return;
        }
        normalizedLinkedFamilyMemberId = familyMemberId;
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [lockedProfile] = await tx.select().from(userProfilesTable).where(and(
        eq(userProfilesTable.clerkId, targetClerkId),
        eq(userProfilesTable.householdId, admin.householdId),
      )).for("update").limit(1);
      if (!lockedProfile) return "missing" as const;
      const resultingRole = role ?? lockedProfile.role;
      const resultingMemberId = linkedFamilyMemberId !== undefined
        ? normalizedLinkedFamilyMemberId ?? null
        : lockedProfile.linkedFamilyMemberId;

      if (resultingRole !== "family" && lockedProfile.linkedFamilyMemberId) return "orphan" as const;
      if (resultingRole !== "family" && normalizedLinkedFamilyMemberId !== undefined) {
        return "invalid-role-link" as const;
      }

      if (resultingRole === "family") {
        if (!resultingMemberId) return "family-link-required" as const;
        const [member] = await tx.select({ id: familyMembersTable.id, role: familyMembersTable.role })
          .from(familyMembersTable)
          .where(and(
            eq(familyMembersTable.id, resultingMemberId),
            eq(familyMembersTable.householdId, admin.householdId),
            eq(familyMembersTable.role, "parent"),
          )).for("update").limit(1);
        if (!member) return "ineligible" as const;
        const [otherLink] = await tx.select({ clerkId: userProfilesTable.clerkId })
          .from(userProfilesTable)
          .where(eq(userProfilesTable.linkedFamilyMemberId, resultingMemberId))
          .limit(1);
        if (otherLink && otherLink.clerkId !== targetClerkId) return "ineligible" as const;
      }
      await tx.update(userProfilesTable).set({
        ...(role !== undefined ? { role } : {}),
        ...(role !== undefined && role !== "family"
          ? { isAdmin: false }
          : isAdmin !== undefined ? { isAdmin } : {}),
        ...(allowedPropertyId !== undefined
          ? { allowedPropertyId: normalizedPropertyId ?? null }
          : {}),
        ...(linkedFamilyMemberId !== undefined
          ? { linkedFamilyMemberId: normalizedLinkedFamilyMemberId ?? null }
          : {}),
      }).where(and(
        eq(userProfilesTable.clerkId, targetClerkId),
        eq(userProfilesTable.householdId, admin.householdId),
      ));
      return "ok" as const;
    });
    if (updated === "missing") {
      res.status(404).json({ error: "User profile not found" });
      return;
    }
    if (updated === "orphan") {
      res.status(409).json({ error: "A linked adult account cannot be unlinked or demoted" });
      return;
    }
    if (updated === "family-link-required") {
      res.status(400).json({ error: "Promoting to a family account requires choosing an unlinked adult family member" });
      return;
    }
    if (updated === "invalid-role-link") {
      res.status(400).json({ error: "Only family accounts can link to an adult family member" });
      return;
    }
    if (updated === "ineligible") {
      res.status(409).json({ error: "That adult is already linked or is not eligible" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "23505") {
      res.status(409).json({ error: "That adult was linked to another account. Refresh and choose a different adult." });
      return;
    }
    req.log.error({ err }, "Failed to update user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /api/admin/family-members/merge-adults — transfer legacy history without touching the linked account. */
router.post("/admin/family-members/merge-adults", async (req, res) => {
  const parsed = MergeDuplicateAdultBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid keepMemberId and legacyMemberId are required", details: parsed.error.flatten() });
    return;
  }
  const keepMemberId = Number(parsed.data.keepMemberId);
  const legacyMemberId = Number(parsed.data.legacyMemberId);
  if (!Number.isInteger(keepMemberId) || !Number.isInteger(legacyMemberId) || keepMemberId === legacyMemberId) {
    res.status(400).json({ error: "The keep and legacy adults must be different valid IDs" });
    return;
  }
  try {
    const adult = await requireApprovedAdult(req, res);
    if (!adult) return;
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`merge-adults:${adult.householdId}`}))`);
      const members = await tx.select().from(familyMembersTable).where(and(
        inArray(familyMembersTable.id, [keepMemberId, legacyMemberId]),
        eq(familyMembersTable.householdId, adult.householdId),
      )).for("update");
      if (members.length !== 2) return { status: "missing" as const };
      if (members.some(member => member.role !== "parent")) return { status: "ineligible" as const };

      const links = await tx.select({
        clerkId: userProfilesTable.clerkId,
        memberId: userProfilesTable.linkedFamilyMemberId,
        role: userProfilesTable.role,
        householdId: userProfilesTable.householdId,
      }).from(userProfilesTable).where(inArray(userProfilesTable.linkedFamilyMemberId, [keepMemberId, legacyMemberId])).for("update");
      const keepLinks = links.filter(link =>
        link.memberId === keepMemberId
        && link.role === "family"
        && link.householdId === adult.householdId,
      );
      const legacyLinks = links.filter(link => link.memberId === legacyMemberId);
      if (keepLinks.length !== 1 || legacyLinks.length !== 0 || links.length !== 1) {
        return { status: "ineligible" as const };
      }

      const counts: Record<string, number> = {};
      counts.chores = (await tx.update(choresTable).set({ assigneeId: keepMemberId })
        .where(eq(choresTable.assigneeId, legacyMemberId)).returning({ id: choresTable.id })).length;
      counts.todoLists = (await tx.update(todoListsTable).set({ assigneeId: keepMemberId })
        .where(eq(todoListsTable.assigneeId, legacyMemberId)).returning({ id: todoListsTable.id })).length;
      counts.todoItems = (await tx.update(todoItemsTable).set({ assigneeId: keepMemberId })
        .where(eq(todoItemsTable.assigneeId, legacyMemberId)).returning({ id: todoItemsTable.id })).length;
      counts.maintenanceTasks = (await tx.update(maintenanceTasksTable).set({ assigneeId: keepMemberId })
        .where(eq(maintenanceTasksTable.assigneeId, legacyMemberId)).returning({ id: maintenanceTasksTable.id })).length;

      const legacyWorkoutRows = await tx.select({ workoutId: workoutParticipantsTable.workoutId })
        .from(workoutParticipantsTable).where(eq(workoutParticipantsTable.memberId, legacyMemberId));
      let participantTransfers = 0;
      for (const row of legacyWorkoutRows) {
        const [collision] = await tx.select({ memberId: workoutParticipantsTable.memberId })
          .from(workoutParticipantsTable).where(and(
            eq(workoutParticipantsTable.workoutId, row.workoutId),
            eq(workoutParticipantsTable.memberId, keepMemberId),
          )).limit(1);
        if (collision) {
          await tx.delete(workoutParticipantsTable).where(and(
            eq(workoutParticipantsTable.workoutId, row.workoutId),
            eq(workoutParticipantsTable.memberId, legacyMemberId),
          ));
        } else {
          await tx.update(workoutParticipantsTable).set({ memberId: keepMemberId }).where(and(
            eq(workoutParticipantsTable.workoutId, row.workoutId),
            eq(workoutParticipantsTable.memberId, legacyMemberId),
          ));
          participantTransfers++;
        }
      }
      counts.workoutParticipants = participantTransfers;
      const legacyWorkoutUpdates = await tx.update(workoutsTable).set({ memberId: keepMemberId })
        .where(eq(workoutsTable.memberId, legacyMemberId)).returning({ id: workoutsTable.id });
      counts.legacyWorkoutOwners = legacyWorkoutUpdates.length;

      const legacyRatings = await tx.select({ id: mealRatingsTable.id, mealPlanId: mealRatingsTable.mealPlanId })
        .from(mealRatingsTable).where(eq(mealRatingsTable.memberId, legacyMemberId)).orderBy(asc(mealRatingsTable.id));
      let collisions = 0;
      let ratingTransfers = 0;
      for (const rating of legacyRatings) {
        const [keepRating] = await tx.select({ id: mealRatingsTable.id }).from(mealRatingsTable).where(and(
          eq(mealRatingsTable.mealPlanId, rating.mealPlanId),
          eq(mealRatingsTable.memberId, keepMemberId),
        )).limit(1);
        if (keepRating) {
          await tx.delete(mealRatingsTable).where(eq(mealRatingsTable.id, rating.id));
          collisions++;
        } else {
          await tx.update(mealRatingsTable).set({ memberId: keepMemberId }).where(eq(mealRatingsTable.id, rating.id));
          ratingTransfers++;
        }
      }
      counts.mealRatings = ratingTransfers;

      counts.personalMemories = (await tx.update(aiMemoriesTable)
        .set({ subjectFamilyMemberId: keepMemberId })
        .where(and(
          eq(aiMemoriesTable.householdId, adult.householdId),
          eq(aiMemoriesTable.subjectFamilyMemberId, legacyMemberId),
        ))
        .returning({ id: aiMemoriesTable.id })).length;

      const referenceCheck = await tx.execute(sql`
        SELECT
          (SELECT count(*) FROM chores WHERE assignee_id = ${legacyMemberId}) +
          (SELECT count(*) FROM todo_lists WHERE assignee_id = ${legacyMemberId}) +
          (SELECT count(*) FROM todo_items WHERE assignee_id = ${legacyMemberId}) +
          (SELECT count(*) FROM maintenance_tasks WHERE assignee_id = ${legacyMemberId}) +
          (SELECT count(*) FROM workouts WHERE member_id = ${legacyMemberId}) +
          (SELECT count(*) FROM workout_participants WHERE member_id = ${legacyMemberId}) +
          (SELECT count(*) FROM meal_ratings WHERE member_id = ${legacyMemberId}) +
          (SELECT count(*) FROM ai_memories WHERE subject_family_member_id = ${legacyMemberId}) +
          (SELECT count(*) FROM user_profiles WHERE linked_family_member_id = ${legacyMemberId})
          AS remaining
      `);
      if (Number((referenceCheck.rows[0] as { remaining: unknown }).remaining) !== 0) {
        throw new Error("LEGACY_REFERENCES_REMAIN");
      }
      const deleted = await tx.delete(familyMembersTable).where(and(
        eq(familyMembersTable.id, legacyMemberId),
        eq(familyMembersTable.householdId, adult.householdId),
      )).returning({ id: familyMembersTable.id });
      if (deleted.length !== 1) throw new Error("LEGACY_DELETE_FAILED");
      return { status: "ok" as const, counts, collisions };
    });
    if (result.status === "missing") {
      res.status(404).json({ error: "Both adults must exist in this household" });
      return;
    }
    if (result.status === "ineligible") {
      res.status(409).json({ error: "Keep must be linked to exactly one approved family account and legacy must be unlinked" });
      return;
    }
    res.json({
      keepMemberId: String(keepMemberId),
      deletedLegacyMemberId: String(legacyMemberId),
      transferredReferences: result.counts,
      mealRatingCollisionsRemoved: result.collisions,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to merge duplicate adults");
    res.status(409).json({ error: "Adult merge was rolled back because not all legacy references could be transferred" });
  }
});

export default router;
