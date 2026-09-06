import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { choresTable } from "./chores";
import { familyMembersTable } from "./familyMembers";
import { householdsTable } from "./households";

export const walletTransactionsTable = pgTable(
  "wallet_transactions",
  {
    id: serial("id").primaryKey(),
    householdId: integer("household_id").notNull().references(() => householdsTable.id, { onDelete: "cascade" }),
    memberId: integer("member_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    type: text("type").notNull(),
    description: text("description").notNull(),
    choreId: integer("chore_id").references(() => choresTable.id, { onDelete: "restrict" }),
    // Internal recurrence discriminator. A chore may earn once per completed
    // occurrence, while approval retries for that occurrence share this key.
    occurrenceKey: text("occurrence_key"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    foreignKey({
      columns: [table.memberId, table.householdId],
      foreignColumns: [familyMembersTable.id, familyMembersTable.householdId],
      name: "wallet_transactions_member_household_fk",
    }).onDelete("cascade"),
    check("wallet_transactions_nonzero_amount", sql`${table.amountCents} <> 0`),
    check(
      "wallet_transactions_type_check",
      sql`${table.type} IN ('chore_reward', 'manual_credit', 'manual_debit', 'adjustment')`,
    ),
    check(
      "wallet_transactions_chore_reward_check",
      sql`(${table.type} = 'chore_reward' AND ${table.choreId} IS NOT NULL
          AND ${table.occurrenceKey} IS NOT NULL AND ${table.amountCents} > 0)
        OR (${table.type} <> 'chore_reward' AND ${table.choreId} IS NULL
          AND ${table.occurrenceKey} IS NULL)`,
    ),
    check(
      "wallet_transactions_manual_sign_check",
      sql`(${table.type} <> 'manual_credit' OR ${table.amountCents} > 0)
        AND (${table.type} <> 'manual_debit' OR ${table.amountCents} < 0)`,
    ),
    index("wallet_transactions_household_member_created_idx").on(
      table.householdId,
      table.memberId,
      table.createdAt,
    ),
    uniqueIndex("wallet_transactions_chore_occurrence_unique")
      .on(table.choreId, table.occurrenceKey)
      .where(sql`${table.type} = 'chore_reward'`),
  ],
);

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;