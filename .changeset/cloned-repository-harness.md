---
'@tenphi/harnesspm': minor
---

Use a cloned repository's harness from another folder: `harnesspm -C <dir> <command>` acts on the project in `<dir>`, `help` lists the project's scripts, MCP servers, rules, docs and skills (fetching its harness packages first when it has no install), `run` and `mcp` use fetched packages and say what is missing instead of `No script`, and the managed block starts with a line for agents outside the folder and gives tools as `npx -y @tenphi/harnesspm run <unit>`.
