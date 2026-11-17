---
"@tenphi/harnesspm": patch
---

Hooks and stdio MCP servers start through the project's own `node_modules/.bin/harnesspm` when it exists, not through npx, which saves about 0.4 s on every hooked tool call. Allow rules keep the npx form.
