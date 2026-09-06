---
name: AI meal-to-recipe continuity
description: Product rule connecting weekly AI meal suggestions to cookbook, grocery, and guided-cooking behavior.
---

Meals added by AI weekly planning must create deduplicated cookbook entries marked as AI-sourced. A cooking meal must expose complete ingredients and instructions, and those persisted fields are the source for shopping-list generation and guided read-aloud cooking. Non-recipes such as eating out, takeout, restaurants, and leftovers should not create cookbook entries.

**Why:** A meal title alone is not actionable; it strands the family without a way to shop for or cook the meal and causes the shopping assistant to guess data that the cookbook should own.

**How to apply:** Preserve meal titles in the plan, hydrate missing AI recipe details when the family opens the cookbook entry, persist the structured result, prefer those ingredients in shopping generation, and reuse the shared guided-cooking audio flow.