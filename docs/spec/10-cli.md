# 10. CLI

**In short**

- Projects use `init`, `sync`, `status`, `why`, `approve` and `run`. Jobs that do not install dependencies use `fetch`.
- Authors use `check` and `new`.
- People use `personal add`, `personal remove` and `personal update`.
- Saving changes to a harness is not a harnesspm command. The owner's rules decide it ([08-improving.md](08-improving.md)).

The npm package and the command are both `harnesspm`. Use `npx harnesspm …` in a project that depends on it, and `npx -y harnesspm …` anywhere else.

## 10.1 Projects

| Command | What it does |
| --- | --- |
| `harnesspm init` | Creates `harnesspm.json`, adds `"prepare": "harnesspm sync"` to `package.json`, makes `CLAUDE.md` import `AGENTS.md`, then runs `harnesspm sync`. |
| `harnesspm sync` | Resolves the layers and writes all outputs. Runs on every install. |
| `harnesspm sync --check` | Writes nothing. Fails when a committed output or the lock is out of date. For CI. |
| `harnesspm sync --no-local` | Ignores the personal layer. Implied when `CI=true`. |
| `harnesspm status` | Layers, packages, versions, pending trust, personal changes to team units, always-on size per agent. |
| `harnesspm why <ID>` | Owner, source, repository and whether the unit is editable ([08-improving.md](08-improving.md#81-find-the-source)). |
| `harnesspm approve [<package>]` | Approves pending or changed executable units and updates the lock. |
| `harnesspm run <plugin>:<script> [-- args]` | Runs a script ([05-executables.md](05-executables.md#51-scripts)). |
| `harnesspm fetch --frozen` | Downloads only the harness packages in the lock, without a full install. For review bots and CI jobs that do not install dependencies. |

`harnesspm mcp <plugin>:<server>` also exists. Agents call it to start MCP servers. People do not need it.

```text
$ npx harnesspm status
📦 dependencies  @cube-dev/ui-kit 0.206.1 → @tenphi/tasty 3.17.1, @tenphi/glaze 2.0.0
🏢 project       harnesspm.json: 1 replace · 1 patch
🙋 personal      github:andrew/harness (everywhere) · project entry cube-ui-kit
⏳ pending       some-third-party: 1 hook (not trusted)
📏 always-on     Codex 18.4 KiB of 32 KiB · Claude Code 212 lines
```

## 10.2 Authors

| Command | What it does |
| --- | --- |
| `harnesspm check [<folder>]` | Validates a harness ([02-package-format.md](02-package-format.md#210-validation)) and warns about files that look like secrets. Run it at `prepack`. |
| `harnesspm new <kind> <name>` | Writes a valid rule, skill, sub-agent, script, hook or MCP server from a template. `--personal` writes it into the personal harness, `--personal --project` into its entry for this project. |
| `harnesspm new patch <rule ID>` | Writes a patch with a copy of the rule's sections and registers it in `harnesspm.json` (or the personal harness with `--personal`). Edit the sections to change and delete the others. |

## 10.3 People

| Command | What it does |
| --- | --- |
| `harnesspm personal add <source> [--project]` | Adds a personal harness, for everywhere or for this project. |
| `harnesspm personal remove <source> [--project]` | Removes it and its outputs. |
| `harnesspm personal update` | Fetches new versions of personal sources. Skips working copies with uncommitted changes or unpushed commits and lists them. |

## 10.4 Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. Pending trust is not an error. |
| `1` | Error: invalid harness, failed check. |
| `2` | `harnesspm run` refused an untrusted or changed script. |
