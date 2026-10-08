import { Router } from "express";
import {
  db,
  HOMEHUB_WEB_TABS,
  householdsTable,
  kioskPhotosTable,
  userProfilesTable,
  type HomeHubWebTab,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";

const router = Router();
const VALID_WEB_TABS = new Set<string>(HOMEHUB_WEB_TABS);
const REQUIRED_WEB_TABS = ["home", "settings"] satisfies HomeHubWebTab[];

/** PATCH /api/household — rename the household and/or mark onboarding complete (admin only) */
router.patch("/household", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);

    if (scope.role !== "family" || !scope.isAdmin) {
      res.status(403).json({ error: "Household administrator access required" });
      return;
    }

    const { name, onboardingCompleted } = req.body as {
      name?: string;
      onboardingCompleted?: boolean;
    };

    const updates: Partial<typeof householdsTable.$inferInsert> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "Household name cannot be empty" });
        return;
      }
      updates.name = name.trim();
    }
    if (onboardingCompleted === true) {
      updates.onboardingCompletedAt = new Date();
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx.update(householdsTable).set(updates)
        .where(eq(householdsTable.id, scope.householdId)).returning();
      if (onboardingCompleted === true && scope.linkedFamilyMemberId) {
        await tx.update(userProfilesTable).set({ personalSetupCompletedAt: new Date() }).where(and(
          eq(userProfilesTable.clerkId, scope.clerkId),
          eq(userProfilesTable.householdId, scope.householdId),
          eq(userProfilesTable.linkedFamilyMemberId, scope.linkedFamilyMemberId),
        ));
      }
      return rows;
    });

    if (!updated) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    res.json({
      id: String(updated.id),
      name: updated.name,
      onboardingCompleted: updated.onboardingCompletedAt !== null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update household");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/household/tab-visibility — update household-wide web tab visibility (admin only) */
router.put("/household/tab-visibility", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);

    if (scope.role !== "family" || !scope.isAdmin) {
      res.status(403).json({ error: "Household administrator access required" });
      return;
    }

    const { visibleTabs } = req.body as { visibleTabs?: unknown };
    if (
      !Array.isArray(visibleTabs)
      || visibleTabs.some(tab => typeof tab !== "string" || !VALID_WEB_TABS.has(tab))
      || new Set(visibleTabs).size !== visibleTabs.length
    ) {
      res.status(400).json({ error: "visibleTabs must contain unique supported tab names" });
      return;
    }

    if (REQUIRED_WEB_TABS.some(tab => !visibleTabs.includes(tab))) {
      res.status(400).json({ error: "Home and Settings must remain visible" });
      return;
    }

    // Store tabs in the canonical navigation order, independent of request order.
    const normalizedTabs = HOMEHUB_WEB_TABS.filter(tab => visibleTabs.includes(tab));
    const [updated] = await db
      .update(householdsTable)
      .set({ visibleTabs: normalizedTabs })
      .where(eq(householdsTable.id, scope.householdId))
      .returning({ visibleTabs: householdsTable.visibleTabs });

    if (!updated) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    res.json({ visibleTabs: updated.visibleTabs });
  } catch (err) {
    req.log.error({ err }, "Failed to update household tab visibility");
    res.status(500).json({ error: "Internal server error" });
  }
});

const KIOSK_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const KIOSK_PHOTO_TYPES: Record<string, (bytes: Buffer) => boolean> = {
  "image/jpeg": bytes => bytes[0] === 0xff && bytes[1] === 0xd8,
  "image/png": bytes => bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  "image/webp": bytes => bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP",
};

/** Checks an uploaded wall screen photo (a base64 data URL) is a real, reasonably sized image. */
export function parseKioskPhoto(image: unknown):
  | { ok: true; mimeType: string; bytes: Buffer }
  | { ok: false; status: 400 | 413; error: string } {
  const match = typeof image === "string" ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(image) : null;
  const looksRight = match ? KIOSK_PHOTO_TYPES[match[1]] : undefined;
  const bytes = match ? Buffer.from(match[2], "base64") : null;
  if (!match || !looksRight || !bytes || !looksRight(bytes)) {
    return { ok: false, status: 400, error: "Send a JPEG, PNG or WebP photo." };
  }
  if (bytes.length > KIOSK_PHOTO_MAX_BYTES) {
    return { ok: false, status: 413, error: "That photo is too large. Keep it under 5 MB." };
  }
  return { ok: true, mimeType: match[1], bytes };
}

/** GET /api/household/kiosk-photo — the wall screen's background photo, for the Settings preview */
router.get("/household/kiosk-photo", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const [photo] = await db.select({ mimeType: kioskPhotosTable.mimeType, bytes: kioskPhotosTable.bytes })
      .from(kioskPhotosTable).where(eq(kioskPhotosTable.householdId, scope.householdId));
    if (!photo) {
      res.status(404).json({ error: "No wall screen photo yet" });
      return;
    }
    res.set("Cache-Control", "private, no-cache");
    res.type(photo.mimeType).send(photo.bytes);
  } catch (err) {
    req.log.error({ err }, "Failed to load wall screen photo");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /api/household/kiosk-photo — set the wall screen's background photo (admin only). Body: { image: data URL } */
router.put("/household/kiosk-photo", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    if (scope.role !== "family" || !scope.isAdmin) {
      res.status(403).json({ error: "Household administrator access required" });
      return;
    }
    const photo = parseKioskPhoto(req.body?.image);
    if (!photo.ok) {
      res.status(photo.status).json({ error: photo.error });
      return;
    }
    const { mimeType, bytes } = photo;
    const updatedAt = new Date();
    await db.insert(kioskPhotosTable)
      .values({ householdId: scope.householdId, mimeType, bytes, updatedAt })
      .onConflictDoUpdate({ target: kioskPhotosTable.householdId, set: { mimeType, bytes, updatedAt } });
    res.json({ ok: true, updatedAt: updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to save wall screen photo");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** DELETE /api/household/kiosk-photo — go back to the plain sky background (admin only) */
router.delete("/household/kiosk-photo", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    if (scope.role !== "family" || !scope.isAdmin) {
      res.status(403).json({ error: "Household administrator access required" });
      return;
    }
    await db.delete(kioskPhotosTable).where(eq(kioskPhotosTable.householdId, scope.householdId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove wall screen photo");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
