---
name: Store-aware shopping lists
description: Ownership and persistence rules for household stores and property grocery lists.
---

Stores are reusable household resources with a complete ordered mapping of grocery categories. The selected store is persisted on each grocery list rather than inferred from a browser-wide or household-wide preference.

**Why:** A household may shop for multiple properties at different stores. Choosing the household's first list or applying one global store can expose or mutate another property's shopping plan.

**How to apply:** Resolve grocery lists within the active property before displaying or creating them, preserve each list's store assignment, and reassign affected lists transactionally when a store is deleted.