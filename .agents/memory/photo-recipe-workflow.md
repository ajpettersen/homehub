---
name: Photo recipe workflow
description: Durable safety and ownership rules for image-derived recipes, groceries, and guided cooking.
---

Recipe images are extracted into an editable draft and must never save a recipe or grocery items until an approved adult explicitly reviews and confirms them. Persisted structured ingredients and steps are the shared source for cookbook details, shopping imports, guided cooking audio, and meal-slot imports. Adding a meal from a screenshot must save the reviewed recipe before filling the slot; adding one from a recipe URL must save or update its structured cookbook entry before filling the slot.

**Why:** Vision extraction can misread quantities or instructions. Automatic persistence would turn uncertain text into household data, while separate copies would drift between the cookbook, grocery list, and cooking mode.

**How to apply:** Keep image extraction review-only, reject URLs without a complete recipe, scope recipe and grocery ownership to the selected property, normalize categories before insertion, deduplicate under a per-list lock, and cancel stale audio/wake-lock work when cooking mode closes or changes steps.