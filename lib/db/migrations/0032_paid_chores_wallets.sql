ALTER TABLE "chores"
  ADD COLUMN IF NOT EXISTS "reward_cents" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "bundle_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;

DO $$ BEGIN
  ALTER TABLE "chores" ADD CONSTRAINT "chores_reward_nonnegative"
    CHECK ("reward_cents" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "chores" ADD CONSTRAINT "chores_bundle_items_array"
    CHECK (jsonb_typeof("bundle_items") = 'array');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "chores" ADD CONSTRAINT "chores_status_check"
    CHECK ("status" IN ('open', 'pending', 'approved'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing completed chores remain completed and require no wallet credit.
UPDATE "chores" SET "status" = 'approved'
WHERE "completed_at" IS NOT NULL AND "status" = 'open';

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "household_id" integer NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "member_id" integer NOT NULL,
  "amount_cents" integer NOT NULL,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "chore_id" integer REFERENCES "chores"("id") ON DELETE RESTRICT,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wallet_transactions_member_household_fk"
    FOREIGN KEY ("member_id", "household_id")
    REFERENCES "family_members"("id", "household_id") ON DELETE CASCADE,
  CONSTRAINT "wallet_transactions_nonzero_amount" CHECK ("amount_cents" <> 0),
  CONSTRAINT "wallet_transactions_type_check"
    CHECK ("type" IN ('chore_reward', 'manual_credit', 'manual_debit', 'adjustment')),
  CONSTRAINT "wallet_transactions_chore_reward_check"
    CHECK (
      ("type" = 'chore_reward' AND "chore_id" IS NOT NULL AND "amount_cents" > 0)
      OR ("type" <> 'chore_reward' AND "chore_id" IS NULL)
    ),
  CONSTRAINT "wallet_transactions_manual_sign_check"
    CHECK (
      ("type" <> 'manual_credit' OR "amount_cents" > 0)
      AND ("type" <> 'manual_debit' OR "amount_cents" < 0)
    )
);

CREATE INDEX IF NOT EXISTS "wallet_transactions_household_member_created_idx"
  ON "wallet_transactions" ("household_id", "member_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_chore_reward_unique"
  ON "wallet_transactions" ("chore_id") WHERE "type" = 'chore_reward';

CREATE OR REPLACE FUNCTION prevent_wallet_transaction_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Cascading removal with its household/member is lifecycle cleanup, not a
  -- ledger mutation. Standalone updates and deletes remain forbidden.
  IF TG_OP = 'DELETE'
    AND NOT EXISTS (SELECT 1 FROM "households" WHERE "id" = OLD."household_id")
  THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE'
    AND NOT EXISTS (
      SELECT 1 FROM "family_members"
      WHERE "id" = OLD."member_id" AND "household_id" = OLD."household_id"
    )
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'wallet transactions are immutable';
END;
$$;

DROP TRIGGER IF EXISTS wallet_transactions_immutable ON "wallet_transactions";
CREATE TRIGGER wallet_transactions_immutable
BEFORE UPDATE OR DELETE ON "wallet_transactions"
FOR EACH ROW EXECUTE FUNCTION prevent_wallet_transaction_mutation();