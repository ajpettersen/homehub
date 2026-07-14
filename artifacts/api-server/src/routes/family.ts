import { Router } from "express";
import { db } from "@workspace/db";
import { familyMembersTable } from "@workspace/db";

const router = Router();

router.get("/family-members", async (req, res) => {
  try {
    const members = await db
      .select()
      .from(familyMembersTable)
      .orderBy(familyMembersTable.id);

    res.json(
      members.map((m) => ({
        id: String(m.id),
        name: m.name,
        role: m.role,
        color: m.color,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get family members");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
