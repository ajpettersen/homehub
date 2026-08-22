import { db } from "@workspace/db";
import { propertiesTable, userProfilesTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Returns the properties a signed-in profile may access.
 * Family profiles share the household's properties; property-bound profiles
 * receive only their explicitly assigned property.
 */
export async function getAuthorizedPropertyIds(clerkId: string): Promise<number[]> {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkId, clerkId))
    .limit(1);

  if (!profile?.householdId) return [];

  if (profile.role === "family") {
    const properties = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(eq(propertiesTable.householdId, profile.householdId));
    return properties.map(property => property.id);
  }

  if (!profile.allowedPropertyId) return [];
  const [property] = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(and(
      eq(propertiesTable.id, profile.allowedPropertyId),
      eq(propertiesTable.householdId, profile.householdId),
    ))
    .limit(1);
  return property ? [property.id] : [];
}