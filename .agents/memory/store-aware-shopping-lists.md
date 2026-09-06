---
name: Store-aware shopping lists
description: Ownership and persistence rules for household stores and property grocery lists.
---

Stores are reusable household resources with a complete ordered mapping of grocery categories. The selected store is persisted on each grocery list rather than inferred from a browser-wide or household-wide preference. Common products come from a shared searchable catalog with canonical categories; custom items remain available for products outside the catalog. Re-adding a checked item reactivates it instead of silently returning the old checked row.

**Why:** A household may shop for multiple properties at different stores. Choosing the household's first list or applying one global store can expose or mutate another property's shopping plan.

**How to apply:** Resolve grocery lists within the active property before displaying or creating them, preserve each list's store assignment, auto-assign catalog categories on selection, surface add failures in the UI, reactivate checked duplicates under the list lock, and reassign affected lists transactionally when a store is deleted.