-- Maintenance tasks can be assigned to a family member (like chores).
ALTER TABLE "maintenance_tasks"
  ADD COLUMN IF NOT EXISTS "assignee_id" integer REFERENCES "family_members"("id") ON DELETE SET NULL;

-- Todo lists can be reordered; higher sort_order floats to the top.
ALTER TABLE "todo_lists"
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
