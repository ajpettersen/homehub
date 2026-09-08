---
name: Home assistant tool compatibility
description: Provider requirement for using HomeHub action tools with the configured chat model.
---

When using `gpt-5.6-luna` through Chat Completions with function tools, set `reasoning_effort` to `none`. A plain request can succeed while every tool-enabled request fails before the model responds.

**Why:** The provider rejects function tools with reasoning enabled for this model and directs callers to either use the Responses API or disable reasoning. Because the Home assistant always includes its action tools, this presents as a total assistant outage rather than a tool-only failure.

**How to apply:** Any Home assistant model or endpoint change must be checked with the complete action-tool contract, not only a plain text completion. Keep provider errors in structured request logging without exposing secrets or household content.