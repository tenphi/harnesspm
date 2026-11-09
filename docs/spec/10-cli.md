# 10. CLI

**In short**

- Projects use `init`, `sync`, `status`, `why`, `approve` and `run`.
- Authors use `check` and `new`.
- People use `personal add`, `personal remove` and `personal update`.
- Saving changes to a harness is not a Tack command. The owner's rules decide it ([08-improving.md](08-improving.md)).

The package is `@tenphi/tack` and the command is `tack`. Use `npx tack …` in a project that depends on it, and `npx -y @tenphi/tack …` anywhere else.

## 10.1 Projects

| Command | What it does |
| --- | --- |
| `tack init` | Creates `tack.json`, adds `"prepare": "tack sync"` to `package.json`, makes `CLAUDE.md` import `AGENTS.md`, then runs `tack sync`. |
| `tack sync` | Resolves the layers and writes all outputs. Runs on every install. |
| `tack sync --check` | Writes nothing. Fails when a committed output or the lock is out of date. For CI. |
| `tack sync --no-local` | Ignores the personal layer. Implied when `CI=true`. |
| `tack status` | Layers, packages, versions, pending trust, personal changes to team units, always-on size per agent. |
| `tack why <ID>` | Owner, source, repository and whether the unit is editable ([08-improving.md](08-improving.md#81-find-the-source)). |
| `tack approve [<package>]` | Approves pending or changed executable units and updates the lock. |
| `tack run <plugin>:<script> [-- args]` | Runs a script ([05-executables.md](05-executables.md#51-scripts)). |

`tack mcp <plugin>:<server>` also exists. Agents call it to start MCP servers. People do not need it.

```text
$ npx tack status
📦 dependencies  @cube-dev/ui-kit 0.206.1 → @tenphi/tasty 3.17.1, @tenphi/glaze 2.0.0
🏢 project       tack.json: 2 replaces
🙋 personal      github:andrew/harness (everywhere) · project entry cube-ui-kit
⏳ pending       some-third-party: 1 hook (not trusted)
📏 always-on     Codex 18.4 KiB of 32 KiB · Claude Code 212 lines
```

## 10.2 Authors

| Command | What it does |
| --- | --- |
| `tack check [<folder>]` | Validates a harness ([02-package-format.md](02-package-format.md#29-validation)) and warns about files that look like secrets. Run it at `prepack`. |
| `tack new <kind> <name>` | Writes a valid rule, skill, sub-agent, script, hook or MCP server from a template. `--personal` writes it into the personal harness, `--personal --project` into its entry for this project. |

## 10.3 People

| Command | What it does |
| --- | --- |
| `tack personal add <source> [--project]` | Adds a personal harness, for everywhere or for this project. |
| `tack personal remove <source> [--project]` | Removes it and its outputs. |
| `tack personal update` | Fetches new versions of personal sources. Skips working copies with uncommitted changes or unpushed commits and lists them. |

## 10.4 Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. Pending trust is not an error. |
| `1` | Error: invalid harness, failed check. |
| `2` | `tack run` refused an untrusted or changed script. |
