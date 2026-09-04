---
name: Post-merge database setup
description: Why automated merge reconciliation uses migrations instead of schema push.
---

Automated post-merge setup must use the repository's idempotent SQL migration runner rather than an interactive schema-push command.

**Why:** Schema push can wait indefinitely when the merge runner has closed stdin, turning an otherwise healthy merge into a timeout. Explicit migrations are deterministic and safe to retry.

**How to apply:** Keep dependency installation in CI/non-interactive mode and run ordered SQL migrations with a bounded database connection timeout.