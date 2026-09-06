---
name: Paid chore wallets
description: Approval, ledger, bundle, and recurrence rules for child allowance rewards.
---

Paid chores are virtual family allowance records, not bank accounts or real-money transfers. A child submits assigned work, and an approved linked adult must approve it before HomeHub posts a wallet credit. A bundle is one chore with several checklist labels and one total payout.

**Why:** Wallet balances must be auditable and cannot change from a child marking their own chore complete. Storing only a mutable balance would allow drift, while one lifetime reward key would prevent recurring chores from paying in later weeks.

**How to apply:** Derive balances from an immutable signed transaction ledger. Post chore rewards transactionally with adult approval, child/household ownership checks, and uniqueness per chore occurrence. Reopen recurring chores only after their frequency window; never reopen pending work.