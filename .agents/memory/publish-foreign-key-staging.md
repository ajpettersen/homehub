---
name: Publish foreign-key staging
description: Safe response when an automatic Publish diff misorders a composite foreign key and its new unique prerequisite.
---

When Publish schedules a new composite foreign key before the matching new unique constraint, use two schema-source-driven publishes: prerequisite uniqueness first, dependent foreign key second.

**Why:** PostgreSQL rejects a composite foreign key unless the exact referenced column set is already unique. The automatic diff may group foreign keys before newly added unique constraints even when development contains both.

**How to apply:** Never patch production directly or add deployment-time DDL. Temporarily omit the dependent foreign key from development schema, verify the first diff contains only the prerequisite, publish, then restore the foreign key and publish again.