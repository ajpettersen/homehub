import { Router } from "express";
import { db } from "@workspace/db";
import { familyMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

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

const createMemberSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["parent", "child", "pet"]),
  color: z.string().min(1),
});

router.post("/family-members", async (req, res) => {
  try {
    const parsed = createMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { name, role, color } = parsed.data;
    const [member] = await db
      .insert(familyMembersTable)
      .values({ name, role, color, avatarInitials: name.charAt(0).toUpperCase() })
      .returning();
    res.status(201).json({
      id: String(member.id),
      name: member.name,
      role: member.role,
      color: member.color,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create family member");
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["parent", "child", "pet"]).optional(),
  color: z.string().min(1).optional(),
});

router.put("/family-members/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const parsed = updateMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const updates: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.name) {
      updates.avatarInitials = parsed.data.name.charAt(0).toUpperCase();
    }

    const [member] = await db
      .update(familyMembersTable)
      .set(updates)
      .where(eq(familyMembersTable.id, id))
      .returning();

    if (!member) return res.status(404).json({ error: "Not found" });

    res.json({
      id: String(member.id),
      name: member.name,
      role: member.role,
      color: member.color,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update family member");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/family-members/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    await db.delete(familyMembersTable).where(eq(familyMembersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete family member");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
