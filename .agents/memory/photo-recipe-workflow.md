---
name: Photo recipe workflow
description: Durable safety and ownership rules for image-derived recipes, groceries, and guided cooking.
---

Recipe images are extracted into an editable draft and must never save a recipe or grocery items until an approved adult explicitly reviews and confirms them. Persisted structured ingredients and steps are the shared source for cookbook details, shopping imports, and guided cooking audio.

**Why:** Vision extraction can misread quantities or instructions. Automatic persistence would turn uncertain text into household data, while separate copies would drift between the cookbook, grocery list, and cooking mode.

**How to apply:** Keep extraction review-only, scope grocery-list selection to the recipe's property, normalize categories before insertion, deduplicate under a per-list lock, and cancel stale audio/wake-lock work when cooking mode closes or changes steps.