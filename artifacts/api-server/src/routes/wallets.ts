import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  familyMembersTable,
  walletTransactionsTable,
} from "@workspace/db";
import {
  getApprovedHouseholdScope,
  requireApprovedLinkedAdult,
} from "../middlewares/requireApprovedHousehold";

const router = Router();

function formatTransaction(transaction: typeof walletTransactionsTable.$inferSelect) {
  return {
    id: String(transaction.id),
    memberId: String(transaction.memberId),
    amountCents: transaction.amountCents,
    type: transaction.type,
    description: transaction.description,
    choreId: transaction.choreId === null ? null : String(transaction.choreId),
    createdBy: transaction.createdBy,
    createdAt: transaction.createdAt.toISOString(),
  };
}

router.get("/wallets", async (req, res) => {
  const scope = getApprovedHouseholdScope(res);
  try {
    const children = await db.select().from(familyMembersTable).where(and(
      eq(familyMembersTable.householdId, scope.householdId),
      eq(familyMembersTable.role, "child"),
    )).orderBy(familyMembersTable.name);
    if (!children.length) {
      res.json([]);
      return;
    }

    const childIds = children.map(child => child.id);
    const balances = await db.select({
      memberId: walletTransactionsTable.memberId,
      balanceCents: sql<number>`coalesce(sum(${walletTransactionsTable.amountCents}), 0)`,
    }).from(walletTransactionsTable).where(and(
      eq(walletTransactionsTable.householdId, scope.householdId),
      inArray(walletTransactionsTable.memberId, childIds),
    )).groupBy(walletTransactionsTable.memberId);
    const balanceByMember = new Map(
      balances.map(row => [row.memberId, Number(row.balanceCents)]),
    );

    const recentEntries = await Promise.all(children.map(async child => {
      const transactions = await db.select().from(walletTransactionsTable).where(and(
        eq(walletTransactionsTable.householdId, scope.householdId),
        eq(walletTransactionsTable.memberId, child.id),
      )).orderBy(
        desc(walletTransactionsTable.createdAt),
        desc(walletTransactionsTable.id),
      ).limit(10);
      return [child.id, transactions] as const;
    }));
    const recentByMember = new Map(recentEntries);

    res.json(children.map(child => ({
      memberId: String(child.id),
      memberName: child.name,
      memberColor: child.color,
      balanceCents: balanceByMember.get(child.id) ?? 0,
      recentTransactions: (recentByMember.get(child.id) ?? []).map(formatTransaction),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get wallets");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/wallets/:memberId/transactions", async (req, res) => {
  const scope = requireApprovedLinkedAdult(res);
  if (!scope) return;
  const memberId = Number(req.params.memberId);
  const amountCents = Number(req.body.amountCents);
  const type = req.body.type;
  const description = typeof req.body.description === "string"
    ? req.body.description.trim()
    : "";

  if (!Number.isInteger(memberId)) {
    res.status(400).json({ error: "Invalid memberId" });
    return;
  }
  if (
    !Number.isInteger(amountCents) ||
    amountCents === 0 ||
    amountCents < -2_147_483_648 ||
    amountCents > 2_147_483_647
  ) {
    res.status(400).json({ error: "amountCents must be a non-zero signed 32-bit integer" });
    return;
  }
  if (!["manual_credit", "manual_debit", "adjustment"].includes(type)) {
    res.status(400).json({ error: "Invalid transaction type" });
    return;
  }
  if (
    (type === "manual_credit" && amountCents < 0) ||
    (type === "manual_debit" && amountCents > 0)
  ) {
    res.status(400).json({ error: "Credit amounts must be positive and debit amounts negative" });
    return;
  }
  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  try {
    const [child] = await db.select({ id: familyMembersTable.id })
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.id, memberId),
        eq(familyMembersTable.householdId, scope.householdId),
        eq(familyMembersTable.role, "child"),
      )).limit(1);
    if (!child) {
      res.status(404).json({ error: "Child wallet not found" });
      return;
    }
    const [created] = await db.insert(walletTransactionsTable).values({
      householdId: scope.householdId,
      memberId,
      amountCents,
      type,
      description,
      choreId: null,
      occurrenceKey: null,
      createdBy: scope.clerkId,
    }).returning();
    res.status(201).json(formatTransaction(created));
  } catch (err) {
    req.log.error({ err }, "Failed to create wallet transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;