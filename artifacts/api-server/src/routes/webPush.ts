import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, webPushSubscriptionsTable } from "@workspace/db";
import { getApprovedHouseholdScope } from "../middlewares/requireApprovedHousehold";
import { vapidKeys } from "../lib/webPush";

const router = Router();
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  deviceLabel?: unknown;
};

function parseSubscription(body: unknown) {
  const value = (body ?? {}) as SubscriptionInput;
  if (
    typeof value.endpoint !== "string" ||
    value.endpoint.length < 1 ||
    value.endpoint.length > MAX_ENDPOINT_LENGTH ||
    !isTrustedPushEndpoint(value.endpoint) ||
    typeof value.keys?.p256dh !== "string" ||
    value.keys.p256dh.length < 1 ||
    value.keys.p256dh.length > MAX_KEY_LENGTH ||
    typeof value.keys.auth !== "string" ||
    value.keys.auth.length < 1 ||
    value.keys.auth.length > MAX_KEY_LENGTH
  ) {
    return null;
  }
  return {
    endpoint: value.endpoint,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
    deviceLabel:
      typeof value.deviceLabel === "string" ? value.deviceLabel.slice(0, 200) : null,
  };
}

const TRUSTED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
];

function isTrustedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      (url.port !== "" && url.port !== "443")
    ) {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    return (
      TRUSTED_PUSH_HOSTS.includes(hostname) ||
      hostname === "notify.windows.com" ||
      hostname.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

router.get("/web-push/public-key", (_req, res): void => {
  res.json({ publicKey: vapidKeys.publicKey });
});

router.post("/web-push/subscriptions", async (req, res): Promise<void> => {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const scope = getApprovedHouseholdScope(res);
  if (scope.role !== "family") {
    res.status(403).json({ error: "Only family accounts can register household notifications" });
    return;
  }
  const subscription = parseSubscription(req.body);
  if (!subscription) {
    res.status(400).json({ error: "A valid browser push subscription is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(webPushSubscriptionsTable)
    .where(eq(webPushSubscriptionsTable.endpoint, subscription.endpoint))
    .limit(1);

  if (existing && existing.clerkId !== clerkId) {
    res.status(409).json({ error: "This browser is registered to another account" });
    return;
  }

  if (existing) {
    await db
      .update(webPushSubscriptionsTable)
      .set({
        householdId: scope.householdId,
        keys: subscription.keys,
        deviceLabel: subscription.deviceLabel ?? existing.deviceLabel,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(webPushSubscriptionsTable.endpoint, subscription.endpoint),
          eq(webPushSubscriptionsTable.clerkId, clerkId),
        ),
      );
  } else {
    await db.insert(webPushSubscriptionsTable).values({
      householdId: scope.householdId,
      clerkId,
      ...subscription,
    });
  }
  res.json({ ok: true });
});

router.delete("/web-push/subscriptions", async (req, res): Promise<void> => {
  const clerkId = getAuth(req).userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const scope = getApprovedHouseholdScope(res);
  if (scope.role !== "family") {
    res.status(403).json({ error: "Only family accounts can manage household notifications" });
    return;
  }
  const endpoint = (req.body as { endpoint?: unknown } | undefined)?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }
  await db
    .delete(webPushSubscriptionsTable)
    .where(
      and(
        eq(webPushSubscriptionsTable.endpoint, endpoint),
        eq(webPushSubscriptionsTable.clerkId, clerkId),
        eq(webPushSubscriptionsTable.householdId, scope.householdId),
      ),
    );
  res.json({ ok: true });
});

export default router;