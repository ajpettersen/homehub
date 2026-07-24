---
name: Orval barrel append bug
description: Orval appends to existing barrel index files instead of overwriting them, causing duplicate exports and typecheck failures.
---

## The rule
After running orval codegen, `lib/api-spec/patch-zod-index.js` rewrites both barrel files to their canonical form. This script is called automatically by the `codegen` script in `lib/api-spec/package.json`.

**Why:** Orval's `clean: true` only cleans the `generated/` subfolder, not the parent barrel `index.ts`. On each codegen run, orval appends its own exports (single-quote style) to whatever already exists in the barrel, producing duplicate `export *` lines. Additionally, the api-zod barrel had a type/value collision: `ScanPantryBody` exported as both a Zod schema value (from `generated/api.ts`) and a TypeScript type (from `generated/types/`). The fix drops the types re-export from api-zod entirely — zod schemas already serve as both validators and type sources.

**How to apply:** Any time a new endpoint is added and codegen is run, the patch script handles cleanup automatically. If you ever add a new barrel file that orval manages, add a normalization step to `patch-zod-index.js`.

## Files involved
- `lib/api-spec/patch-zod-index.js` — the normalization script
- `lib/api-spec/package.json` codegen script — calls orval, then the patch, then typecheck
- `lib/api-zod/src/index.ts` — normalized to `export * from "./generated/api";` only
- `lib/api-client-react/src/index.ts` — normalized to the 4-line canonical barrel
