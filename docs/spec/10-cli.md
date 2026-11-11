# 10. CLI

**In short**

- Projects use `init`, `sync`, `status`, `why`, `approve` and `run`. Jobs that do not install dependencies use `fetch`.
- Authors use `check` and `new`.
- People use `add`, `remove` and `update` for harnesses on top of the repository's.
- Saving changes to a harness is not a harnesspm command. The owner's rules decide it ([08-improving.md](08-improving.md)).

The npm package and the command are both `harnesspm`. Use `npx harnesspm …` in a project that depends on it, and `npx -y harnesspm …` anywhere else.

## 10.1 Projects

| Command | What it does |
| --- | --- |
| `harnesspm init` | Creates `harnesspm.json`, adds `harnesspm sync` to the `postinstall` script of a private package or to `prepare` otherwise, makes `CLAUDE.md` import `AGENTS.md`, then runs `harnesspm sync`. |
| `harnesspm sync` | Resolves the layers and writes all outputs. Runs on every install. In a repository that does not use harnesspm (it has no `harnesspm.json`), or whose dependencies are not installed, it writes only the per-machine outputs of added harnesses, so it never wipes the committed block. When an agent runs it, new allow rules, hooks and MCP servers stay pending ([06-trust.md](06-trust.md#62-trusting-a-package)). |
| `harnesspm sync --check` | Writes nothing and ignores added harnesses, as every run with `CI=true` does. Fails when a committed output or the lock is out of date. For CI. |
| `harnesspm status` | Layers, packages, versions, pending trust, changes that added harnesses make to the repository's units, always-on size per agent. |
| `harnesspm why <ID>` | Owner, source, repository and whether the unit is editable ([08-improving.md](08-improving.md#81-find-the-source)). |
| `harnesspm approve [<package>]` | Writes the entries that a model run left pending, and records a `"pin"` package's new version as approved in the lock. A person runs it, not an agent. |
| `harnesspm run [--agent <agent>] <plugin>:<script> [-- args]` | Runs a script ([05-executables.md](05-executables.md#51-scripts)). Hooks pass `--agent`, which sets `HARNESSPM_AGENT`. |
| `harnesspm fetch` | Downloads only the harness packages in the lock, without a full install. For review bots and CI jobs that do not install dependencies. |

Package managers run these scripts on a full install, but not on `npm install <pkg>`, `npm uninstall` or `pnpm add`, so run `npx harnesspm sync` after those. `sync --check` in CI catches a missed one. `postinstall` would also run when others install a published package, so `init` uses it only in a private package; Yarn 2 and later run `postinstall` but not `prepare` ([research](../research/package-managers.md)).

`harnesspm mcp [--agent <agent>] <plugin>:<server>` also exists. Agents call it to start stdio MCP servers. People do not need it.

```text
$ npx harnesspm status
📦 dependencies  @cube-dev/ui-kit 0.206.1 → @tenphi/tasty 3.17.1, @tenphi/glaze 2.0.0
🏢 project       harnesspm.json: 1 replace · 1 patch
➕ added         github:cube-js/frontend-harness (user) · github:andrew/harness (user), project entry cube-ui-kit
⏳ pending       some-third-party: 1 hook (not trusted)
📏 always-on     Codex 18.4 KiB of 32 KiB · Claude Code 212 lines
```

## 10.2 Authors

| Command | What it does |
| --- | --- |
| `harnesspm check [<folder>]` | Validates a harness ([02-package-format.md](02-package-format.md#210-validation)) and warns about files that look like secrets. Run it at `prepack`. |
| `harnesspm new <kind> <name>` | `<kind>` is `rule`, `skill`, `agent` (a sub-agent), `script`, `hook` or `mcp`. Writes a valid unit from a template. `--to <plugin>` writes it into an added harness, `--to <plugin> --entry` into its entry for this repository. |
| `harnesspm new patch <rule ID>` | Writes a patch with a copy of the rule's sections and registers it: in `harness/plugin.json` when the rule reaches the project through its own harness's `extends`, so users get the change too; otherwise in `harnesspm.json`; with `--to <plugin>`, in that added harness. Edit the sections to change and delete the others. |

## 10.3 People

| Command | What it does |
| --- | --- |
| `harnesspm add <source> [--local] [--no-hook]` | Adds a harness on top of the repository's: with user scope, or with `--local` for this repository only. Installs the `SessionStart` hook ([07-added.md](07-added.md#75-applying-in-every-repository)) and prints the added always-on rules. |
| `harnesspm remove <source> [--local]` | Removes it and its outputs. With the last harness with user scope, the hook and write access go too. |
| `harnesspm update` | Fetches new versions of added harnesses and rewrites their outputs. Skips working copies with uncommitted changes or unpushed commits and lists them. |

## 10.4 Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. Pending trust is not an error. |
| `1` | Error: invalid harness, failed check. |
| `2` | `harnesspm run` refused a script ([05-executables.md](05-executables.md#51-scripts)). When a hook calls it, `2` also blocks the event: harnesspm fails closed. |
