import { Router } from "express";
import { db } from "@workspace/db";
import { propertiesTable } from "@workspace/db";

const router = Router();

router.get("/properties", async (req, res) => {
  try {
    const props = await db.select().from(propertiesTable).orderBy(propertiesTable.id);

    res.json(
      props.map((p) => ({
        id: String(p.id),
        name: p.name,
        type: p.type,
        icon: p.icon,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get properties");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
