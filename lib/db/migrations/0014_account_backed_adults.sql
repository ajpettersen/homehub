CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_linked_family_member_unique"
  ON "user_profiles" ("linked_family_member_id")
  WHERE "linked_family_member_id" IS NOT NULL;