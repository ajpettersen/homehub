import { Router } from "express";
import { getApprovedHouseholdScope, isApprovedLinkedAdultScope, requireApprovedLinkedAdult } from "../middlewares/requireApprovedHousehold";
import { HatchAuthError, HatchRateError, forgetHatchAccount, getHatchSnapshot, verifyHatchLogin } from "../lib/hatchClient";
import { deleteHatchConnection, loadHatchAccount, saveHatchConnection } from "../lib/hatchCredentials";

const router = Router();

// Hatch throttles sign-ins hard (a handful of wrong tries in a minute is enough),
// so wrong passwords are limited per household, and a throttle from Hatch pauses
// attempts for a while: every further try can extend Hatch's own lockout.
const FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 3;
const THROTTLE_PAUSE_MS = 15 * 60_000;
const failures = new Map<number, number[]>();
const pausedUntil = new Map<number, number>();

function recentFailures(householdId: number, now = Date.now()): number[] {
  const recent = (failures.get(householdId) ?? []).filter(at => now - at < FAILURE_WINDOW_MS);
  failures.set(householdId, recent);
  return recent;
}

function minutesLeft(until: number): number {
  return Math.max(1, Math.ceil((until - Date.now()) / 60_000));
}

// Mounted after requireApprovedHousehold, so everything here needs a signed-in
// member of an approved household. Only parents can connect or disconnect.
router.get("/hatch/alarms", async (req, res) => {
  try {
    const scope = getApprovedHouseholdScope(res);
    const found = await loadHatchAccount(scope.householdId);
    const base = { canManage: isApprovedLinkedAdultScope(scope), connectedAs: found?.account.email ?? null, source: found?.source ?? null };
    if (!found) {
      res.json({ ...base, configured: false, unavailable: false, stale: false, devices: [] });
      return;
    }
    const snapshot = await getHatchSnapshot(found.account, req.log);
    res.json({
      ...base,
      configured: true,
      unavailable: snapshot === null,
      stale: snapshot?.stale ?? false,
      devices: snapshot?.devices ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load Hatch alarms");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/hatch/connection", async (req, res) => {
  try {
    const scope = requireApprovedLinkedAdult(res);
    if (!scope) return;

    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password || email.length > 254 || password.length > 200 || !email.includes("@")) {
      res.status(400).json({ error: "Enter the email and password you use for the Hatch app." });
      return;
    }
    const pause = pausedUntil.get(scope.householdId) ?? 0;
    if (pause > Date.now()) {
      res.status(429).json({ error: `Hatch asked us to slow down. Please wait about ${minutesLeft(pause)} more minutes before trying again.` });
      return;
    }
    const wrongTries = recentFailures(scope.householdId);
    if (wrongTries.length >= MAX_FAILURES) {
      res.status(429).json({ error: `Hatch didn't accept those details ${MAX_FAILURES} times. Check them in the Hatch app, then wait about ${minutesLeft(wrongTries[0] + FAILURE_WINDOW_MS)} minutes before trying again.` });
      return;
    }

    try {
      await verifyHatchLogin(email, password);
    } catch (error) {
      if (error instanceof HatchAuthError) {
        failures.set(scope.householdId, [...recentFailures(scope.householdId), Date.now()]);
        res.status(401).json({ error: "Hatch didn't accept that email and password." });
        return;
      }
      if (error instanceof HatchRateError) {
        pausedUntil.set(scope.householdId, Date.now() + THROTTLE_PAUSE_MS);
        res.status(429).json({ error: "Hatch asked us to slow down. Please wait about 15 minutes before trying again." });
        return;
      }
      req.log.warn({ err: error }, "Couldn't reach Hatch while connecting");
      res.status(502).json({ error: "Couldn't reach Hatch. Try again in a minute." });
      return;
    }

    await saveHatchConnection(scope.householdId, email, password);
    forgetHatchAccount(`household:${scope.householdId}`);
    failures.delete(scope.householdId);
    pausedUntil.delete(scope.householdId);
    res.json({ ok: true, connectedAs: email });
  } catch (err) {
    req.log.error({ err }, "Failed to save Hatch connection");
    res.status(500).json({ error: "Couldn't save the Hatch login. Please try again." });
  }
});

router.delete("/hatch/connection", async (req, res) => {
  try {
    const scope = requireApprovedLinkedAdult(res);
    if (!scope) return;
    await deleteHatchConnection(scope.householdId);
    forgetHatchAccount(`household:${scope.householdId}`);
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to remove Hatch connection");
    res.status(500).json({ error: "Couldn't disconnect Hatch. Please try again." });
  }
});

export default router;
