---
"@tenphi/harnesspm": patch
---

Hooks and MCP servers start harnesspm as `node <project>/node_modules/@tenphi/harnesspm/dist/cli.js`, and the package ships `dist/cli.js` as executable, so hooks keep working after Yarn 4 upgrades harnesspm in place.
