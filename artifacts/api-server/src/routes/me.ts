import { Router } from "express";
import { createHash } from "node:crypto";
import { clerkClient, getAuth } from "@clerk/express";
import {
  db,
  familyMembersTable,
  householdJoinRequestsTable,
  HOMEHUB_WEB_TABS,
  householdsTable,
  propertiesTable,
  userProfilesTable,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
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

  const administratorEmail =
    typeof req.body?.administratorEmail === "string"
      ? req.body.administratorEmail.trim().toLowerCase()
      : "";
  if (
    administratorEmail.length < 3 ||
    administratorEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(administratorEmail)
  ) {
    res.status(400).json({ error: "Enter a valid administrator email." });
    return;
  }

  try {
    const rateAllowed = await claimJoinAttempt(clerkId, req.ip || "unknown");
    const requester = await clerkClient.users.getUser(clerkId).catch(() => null);
    const users = await clerkClient.users.getUserList({
      emailAddress: [administratorEmail],
      limit: 2,
    }).catch(() => ({ data: [] }));
    const administrator = users.data.length === 1 ? users.data[0] : null;
    // Always perform this lookup, including self and unknown identities.
    const [administratorProfile] = await db
      .select({
        householdId: userProfilesTable.householdId,
        role: userProfilesTable.role,
        isAdmin: userProfilesTable.isAdmin,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkId, administrator?.id ?? "__no_matching_clerk_user__"))
      .limit(1);
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
      && administrator?.id !== clerkId
      && administratorProfile?.role === "family"
      && administratorProfile.isAdmin
      && !!administratorProfile.householdId
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
          targetHouseholdId: administratorProfile.householdId!,
          requesterDisplayName,
          requesterEmail: verifiedEmail!,
          status: "pending",
          updatedAt: new Date(),
          decidedAt: null,
        };
      if (existingRequest) {
        await tx.update(householdJoinRequestsTable).set({
            targetHouseholdId: administratorProfile.householdId!,
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

/** GET /api/admin/join-requests — pending requests are visible only to that household's admins */
router.get("/admin/join-requests", async (req, res) => {
  try {
    const admin = await requireFamilyAdmin(req, res);
    if (!admin) return;
    const requests = await db
      .select({
        id: householdJoinRequestsTable.id,
        requesterDisplayName: householdJoinRequestsTable.requesterDisplayName,
        requesterEmail: householdJoinRequestsTable.requesterEmail,
        createdAt: householdJoinRequestsTable.createdAt,
      })
      .from(householdJoinRequestsTable)
      .where(and(
        eq(householdJoinRequestsTable.targetHouseholdId, admin.householdId),
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

/** PUT /api/admin/join-requests/:requestId — decide and atomically provision an approved member */
router.put("/admin/join-requests/:requestId", async (req, res) => {
  const requestId = Number(req.params.requestId);
  const { decision, linkedFamilyMemberId } = req.body;
  if (!Number.isInteger(requestId) || !["approved", "denied"].includes(decision)) {
    res.status(400).json({ error: "Invalid join request decision" });
    return;
  }
  try {
    const admin = await requireFamilyAdmin(req, res);
    if (!admin) return;

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
        eq(householdJoinRequestsTable.targetHouseholdId, admin.householdId),
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
        eq(householdJoinRequestsTable.targetHouseholdId, admin.householdId),
        eq(householdJoinRequestsTable.status, "pending"),
      )).for("update").limit(1);
      if (!request) return "missing" as const;

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
            eq(familyMembersTable.householdId, admin.householdId),
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
          householdId: admin.householdId,
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
          householdId: admin.householdId,
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

export default router;
