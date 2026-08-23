/**
 * One-time production data repair (August 2026).
 *
 * Background: seedIfEmpty() used to run on every server start and seeded a
 * demo household into any empty database — including the fresh PRODUCTION
 * database. The first real signup was then joined to that seeded household,
 * so completing the onboarding wizard piled real data on top of the demo
 * rows, leaving duplicated family members plus seeded properties/lists.
 * (Startup demo seeding has since been removed, and the wizard now clears
 * the household before inserting — this repairs the household that was
 * affected before those fixes shipped.)
 *
 * Targeting — this repair is pinned to the ONE verified affected install:
 *  - It only acts on households that (a) completed onboarding AND (b) contain
 *    the specific Clerk user profile verified in the affected production
 *    database (AFFECTED_CLERK_ID). A fresh or unrelated production database
 *    can never match, so nothing is ever deleted there.
 *  - Every deletion is additionally bounded to rows created before a fixed
 *    historical cutoff (CREATED_BEFORE), so data created after this repair
 *    was written can never be touched.
 *
 * What it deletes (full cleanup, per the household owner's choice):
 *  - Seed-signature family members (AJ/Emily/Holden/Brody/Daphne/Willa)
 *    created well BEFORE the household completed onboarding. Wizard-created
 *    members were inserted in the same transaction that set the completion
 *    flag, so their created_at equals the flag timestamp — the 1-minute
 *    buffer cleanly separates the two groups.
 *  - Seed-signature properties ("Main House"/"Cabin") created before the
 *    flag, but only if nothing references them (no chores, maintenance,
 *    meal plans, or grocery items) so real data added since can never be
 *    lost. Property deletion cascades to their empty grocery lists.
 *  - Orphaned properties with NULL household_id (left over from a July
 *    schema era; invisible to the app but holding ~74 junk maintenance
 *    tasks, which cascade away). Only deleted when the affected household
 *    was found in this database.
 *  - The three seeded to-do lists, only if they contain no items.
 *
 * Safety:
 *  - Runs ONLY in deployed production (REPLIT_DEPLOYMENT / NODE_ENV). The
 *    development database intentionally keeps its seeded household and MUST
 *    NOT be touched — never remove the environment gate or add a force flag.
 *  - Runs ONCE: a marker row in one_time_cleanups is claimed inside the same
 *    transaction as the deletions, so concurrent instances can't double-run
 *    and a failed attempt retries on the next boot.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./lib/logger";

const CLEANUP_KEY = "remove-preonboarding-seed-2026-08";

/**
 * The Clerk user id of the household owner in the verified affected
 * production database. The repair is inert in any database whose completed
 * households do not contain this exact profile.
 */
const AFFECTED_CLERK_ID = "user_3IJxMddG5C1sFYf0BAbFZdmo7Ou";

/** Fixed historical cutoff: rows created on/after this date are never touched. */
const CREATED_BEFORE = "2026-08-24T00:00:00Z";

function isProduction(): boolean {
  return (
    process.env["REPLIT_DEPLOYMENT"] === "1" ||
    process.env["NODE_ENV"] === "production"
  );
}

export async function runOneTimeProdCleanup(): Promise<void> {
  if (!isProduction()) {
    return;
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS one_time_cleanups (
        key text PRIMARY KEY,
        executed_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.transaction(async (tx) => {
      const claim = await tx.execute(sql`
        INSERT INTO one_time_cleanups (key) VALUES (${CLEANUP_KEY})
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      `);
      if (claim.rows.length === 0) {
        return; // already executed (possibly by another instance)
      }

      // Pin the repair to the verified affected household(s). In any other
      // database this is empty and the whole repair is a no-op.
      const affected = await tx.execute(sql`
        SELECT h.id FROM households h
        WHERE h.onboarding_completed_at IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.household_id = h.id AND up.clerk_id = ${AFFECTED_CLERK_ID}
          )
      `);
      const householdIds = affected.rows.map((r) => Number((r as { id: unknown }).id));
      if (householdIds.length === 0) {
        logger.info(
          { cleanup: CLEANUP_KEY },
          "One-time cleanup: affected household not present; nothing to do",
        );
        return; // marker still commits — this database never needs the repair
      }

      const members = await tx.execute(sql`
        DELETE FROM family_members fm
        USING households h
        WHERE fm.household_id = h.id
          AND h.id IN ${householdIds}
          AND fm.created_at < ${CREATED_BEFORE}::timestamptz
          AND fm.created_at < h.onboarding_completed_at - interval '1 minute'
          AND (fm.name, fm.role) IN (
            ('AJ', 'parent'), ('Emily', 'parent'), ('Holden', 'child'),
            ('Brody', 'child'), ('Daphne', 'child'), ('Willa', 'pet')
          )
        RETURNING fm.id
      `);

      const seededProps = await tx.execute(sql`
        DELETE FROM properties p
        USING households h
        WHERE p.household_id = h.id
          AND h.id IN ${householdIds}
          AND p.created_at < ${CREATED_BEFORE}::timestamptz
          AND p.created_at < h.onboarding_completed_at - interval '1 minute'
          AND (
            (p.name = 'Main House' AND p.type = 'house') OR
            (p.name = 'Cabin' AND p.type = 'cabin')
          )
          AND NOT EXISTS (SELECT 1 FROM chores c WHERE c.property_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM maintenance_tasks mt WHERE mt.property_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM meal_plans mp WHERE mp.property_id = p.id)
          AND NOT EXISTS (
            SELECT 1 FROM grocery_lists gl
            JOIN grocery_items gi ON gi.list_id = gl.id
            WHERE gl.property_id = p.id
          )
        RETURNING p.id
      `);

      const orphanProps = await tx.execute(sql`
        DELETE FROM properties
        WHERE household_id IS NULL
          AND created_at < ${CREATED_BEFORE}::timestamptz
        RETURNING id
      `);

      const todoLists = await tx.execute(sql`
        DELETE FROM todo_lists tl
        USING households h
        WHERE tl.household_id = h.id
          AND h.id IN ${householdIds}
          AND tl.created_at < ${CREATED_BEFORE}::timestamptz
          AND tl.created_at < h.onboarding_completed_at - interval '1 minute'
          AND tl.name IN ('Family To-Do', 'House Projects', 'Cabin Projects')
          AND NOT EXISTS (SELECT 1 FROM todo_items ti WHERE ti.list_id = tl.id)
        RETURNING tl.id
      `);

      logger.info(
        {
          cleanup: CLEANUP_KEY,
          householdIds,
          deletedFamilyMembers: members.rows.length,
          deletedSeededProperties: seededProps.rows.length,
          deletedOrphanProperties: orphanProps.rows.length,
          deletedTodoLists: todoLists.rows.length,
        },
        "One-time pre-onboarding seed cleanup completed",
      );
    });
  } catch (err) {
    // Never block startup on the repair; it will retry on the next boot
    // because the marker row is only committed together with the deletions.
    logger.error({ err }, "One-time pre-onboarding seed cleanup failed");
  }
}
