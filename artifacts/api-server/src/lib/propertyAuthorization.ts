import { db } from "@workspace/db";
import { familyMembersTable, propertiesTable, userProfilesTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Returns the properties a signed-in profile may access.
 * Family profiles share the household's properties; property-bound profiles
 * receive only their explicitly assigned property.
 */
export async function getAuthorizedPropertyIds(clerkId: string): Promise<number[]> {
  const scope = await getPropertyAuthorizationScope(clerkId);
  return scope?.propertyIds ?? [];
}

export interface PropertyAuthorizationScope {
  clerkId: string;
  householdId: number;
  propertyIds: number[];
  role: "family" | "cleaner";
  isAdmin: boolean;
  linkedFamilyMemberId: number | null;
}

export async function getPropertyAuthorizationScope(
  clerkId: string,
): Promise<PropertyAuthorizationScope | null> {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, clerkId))
    .limit(1);

  if (!profile?.householdId || (profile.role !== "family" && profile.role !== "cleaner")) {
    return null;
  }

  if (profile.role === "family") {
    const [linkedAdult] = profile.linkedFamilyMemberId
      ? await db.select({ id: familyMembersTable.id }).from(familyMembersTable).where(and(
          eq(familyMembersTable.id, profile.linkedFamilyMemberId),
          eq(familyMembersTable.householdId, profile.householdId),
          eq(familyMembersTable.role, "parent"),
        )).limit(1)
      : [];
    const properties = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(eq(propertiesTable.householdId, profile.householdId));
    return {
      clerkId,
      householdId: profile.householdId,
      propertyIds: properties.map(property => property.id),
      role: "family",
      isAdmin: profile.isAdmin,
      linkedFamilyMemberId: linkedAdult?.id ?? null,
    };
  }

  if (!profile.allowedPropertyId) {
    return { clerkId, householdId: profile.householdId, propertyIds: [], role: "cleaner", isAdmin: false, linkedFamilyMemberId: null };
  }
  const [property] = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(and(
      eq(propertiesTable.id, profile.allowedPropertyId),
      eq(propertiesTable.householdId, profile.householdId),
    ))
    .limit(1);
  return {
    clerkId,
    householdId: profile.householdId,
    propertyIds: property ? [property.id] : [],
    role: "cleaner",
    isAdmin: false,
    linkedFamilyMemberId: null,
  };
}