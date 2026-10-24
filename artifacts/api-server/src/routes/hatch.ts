import { Router } from "express";
import { getHatchSnapshot, isHatchConfigured } from "../lib/hatchClient";

const router = Router();

// Read-only for now. Mounted after requireApprovedHousehold, so only signed-in
// members of an approved household can see the kids' alarms.
router.get("/hatch/alarms", async (req, res) => {
  try {
    if (!isHatchConfigured()) {
      res.json({ configured: false, unavailable: false, stale: false, devices: [] });
      return;
    }
    const snapshot = await getHatchSnapshot();
    res.json({
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

export default router;
