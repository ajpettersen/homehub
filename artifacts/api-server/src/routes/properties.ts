import { Router } from "express";
import { db, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
        address: p.address ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get properties");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/properties/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { name, address, icon, type } = req.body as {
      name?: string;
      address?: string | null;
      icon?: string;
      type?: string;
    };

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (icon !== undefined) updates.icon = icon;
    if (type !== undefined) updates.type = type;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(propertiesTable)
      .set(updates)
      .where(eq(propertiesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Property not found" });
      return;
    }

    res.json({
      id: String(updated.id),
      name: updated.name,
      type: updated.type,
      icon: updated.icon,
      address: updated.address ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update property");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Proxy Google Street View image (keeps API key server-side)
router.get("/properties/:id/streetview", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [prop] = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.id, id));

    if (!prop) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!prop.address) {
      res.status(404).json({ error: "No address set" });
      return;
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Street view not configured" });
      return;
    }

    const url = new URL("https://maps.googleapis.com/maps/api/streetview");
    url.searchParams.set("size", "600x300");
    url.searchParams.set("location", prop.address);
    url.searchParams.set("fov", "90");
    url.searchParams.set("pitch", "5");
    url.searchParams.set("key", apiKey);

    const upstream = await fetch(url.toString());
    if (!upstream.ok) {
      res.status(502).json({ error: "Street view unavailable" });
      return;
    }

    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "Street view proxy failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
