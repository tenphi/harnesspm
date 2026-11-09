# 9. CLI

The package is `@tenphi/tack`. The command is `tack`. Every command works through `npx tack …` when Tack is a project dependency, and through `npx -y @tenphi/tack …` when it is not.

## 9.1 Consumers

| Command | What it does |
| --- | --- |
| `tack init` | Creates `tack.json`, adds `"prepare": "tack sync"` to `package.json`, makes `CLAUDE.md` import `AGENTS.md`, then runs `tack sync`. |
| `tack sync` | Resolves all layers and writes all outputs. Runs on every install through `prepare`. |
| `tack sync --check` | Writes nothing. Fails when a committed output or the lock is out of date. For CI. |
| `tack sync --no-local` | Ignores the personal layers. Implied when `CI=true`. |
| `tack status` | Shows the layers, packages, versions, pending trust, local changes to team units and always-on size per agent. |
| `tack why <unit ID>` | Shows where a unit comes from: layer, package, `extends` chain, and any `replace` or `exclude` on the way. |
| `tack diff [<ref>]` | Shows harness changes compared with the lock at a git ref (default: `HEAD`). Useful after a dependency upgrade. |
| `tack approve [<package>]` | Approves pending or changed executable units and updates the lock. |
| `tack run <plugin>:<script> [-- args]` | Runs a script. See [05-executables.md](05-executables.md#51-scripts). |
| `tack mcp <plugin>:<server>` | Starts a stdio MCP server. Agents call this. People do not need to. |

Example of `tack status`:

```
🌍 global    github:andrew/harness (andrew) 4f2a1c9         3 rules · 2 skills
📦 deps      @cube-dev/ui-kit 0.206.1 → @tenphi/tasty 3.17.1, @tenphi/glaze 2.0.0
🏢 project   tack.json                                       2 replaces
🙋 local     ./harness.local                                 1 replace · 1 script
⏳ pending   some-third-party: 1 hook (not trusted)
📏 always-on Codex 18.4 KiB / 32 KiB · Claude Code 212 lines
```

## 9.2 Producers

| Command | What it does |
| --- | --- |
| `tack pack-check` | Validates `harness/` for publishing. See [02-package-format.md](02-package-format.md#29-validation). Run it at `prepack`. |
| `tack new <kind> <name>` | Writes a valid rule, skill, sub-agent, script, hook or MCP server from a template. |

## 9.3 Personal harness

| Command | What it does |
| --- | --- |
| `tack personal add <source> [--project]` | Adds a personal harness. Global by default. |
| `tack personal remove <source> [--project]` | Removes it and its outputs. |
| `tack personal new <kind> <name> [--project]` | Creates a unit in a personal harness. |
| `tack personal extend <source>` | Adds a package to the personal harness's own `extends`. |
| `tack personal status` | Lists changes in the personal working copies. |
| `tack personal diff` | Shows those changes. |
| `tack personal save -m <message>` | Validates and commits. |
| `tack personal push [--branch <name>]` | Pushes, or writes a patch to `~/.tack/outbox/` when it cannot. |
| `tack personal pull` | Fetches and rebases the working copies. |

## 9.4 Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. Pending trust is not an error. |
| `1` | Error: invalid harness, conflict, failed check. |
| `2` | `tack run` refused an untrusted or changed script. |
