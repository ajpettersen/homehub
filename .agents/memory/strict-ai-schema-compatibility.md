---
name: Strict AI schema compatibility
description: How to preserve application invariants when an AI provider rejects valid JSON Schema keywords in strict structured output.
---

Do not put array uniqueness constraints such as `uniqueItems` in strict structured-output schemas unless the active provider explicitly supports them. Keep the output schema provider-compatible, then enforce uniqueness with Zod or explicit server validation before returning or saving the result.

**Why:** The OpenAI-compatible structured-output endpoint rejected a weekly workout schema before generation because `uniqueItems` was not permitted. Server-side duplicate validation already provided the same safety boundary without depending on provider schema support.

**How to apply:** When adding or changing strict AI JSON schemas, distinguish provider-supported shape constraints from business invariants. Validate ownership, uniqueness, authorization, and date boundaries again on the server even if the provider later supports those keywords.