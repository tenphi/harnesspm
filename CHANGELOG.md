# Changelog

## 0.4.0

### Minor Changes

- [#9](https://github.com/tenphi/harnesspm/pull/9) [`2d69197`](https://github.com/tenphi/harnesspm/commit/2d69197802d6ab483ac8b72143c2b500f2d7fc6d) Thanks [@tenphi](https://github.com/tenphi)! - With `CI=true`, `harnesspm sync` writes only per-machine files and leaves `AGENTS.md`, `CLAUDE.md` and the lock as they are, so `sync --check` after an install catches a missed sync. `sync --write` writes them anyway, for jobs that commit the result.

- [#9](https://github.com/tenphi/harnesspm/pull/9) [`2d69197`](https://github.com/tenphi/harnesspm/commit/2d69197802d6ab483ac8b72143c2b500f2d7fc6d) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm sync` makes Claude Code read nested `AGENTS.md` files again: each one that git tracks gets a `CLAUDE.md` next to it with `@AGENTS.md`, because the root `CLAUDE.md` silenced them. `sync --check` and `doctor` report a missing import.

### Patch Changes

- [#9](https://github.com/tenphi/harnesspm/pull/9) [`2d69197`](https://github.com/tenphi/harnesspm/commit/2d69197802d6ab483ac8b72143c2b500f2d7fc6d) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm status` says `AGENTS.md` is over Codex's 32 KiB limit, instead of close to it, once it is past 32 KiB, and `harnesspm doctor` warns about it under Outputs: Codex reads only the first 32 KiB.

- [#7](https://github.com/tenphi/harnesspm/pull/7) [`b58879e`](https://github.com/tenphi/harnesspm/commit/b58879e0850c56658c4bc5b59d7fec8e2b3331e0) Thanks [@tenphi](https://github.com/tenphi)! - The package's homepage is now the docs site, https://harnesspm.tenphi.me. The specification's links to files of this repository that are not in the package point at GitHub.

- [#7](https://github.com/tenphi/harnesspm/pull/7) [`b58879e`](https://github.com/tenphi/harnesspm/commit/b58879e0850c56658c4bc5b59d7fec8e2b3331e0) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm doctor` says how to turn on an untrusted package's units once per line, not twice.

- [#9](https://github.com/tenphi/harnesspm/pull/9) [`2d69197`](https://github.com/tenphi/harnesspm/commit/2d69197802d6ab483ac8b72143c2b500f2d7fc6d) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm.lock.json` no longer records the project's own version, so a release that raises `version` in `package.json` no longer makes the lock out of date. A lock that has it still passes `sync --check`, and the next `sync` drops it.

- [#9](https://github.com/tenphi/harnesspm/pull/9) [`2d69197`](https://github.com/tenphi/harnesspm/commit/2d69197802d6ab483ac8b72143c2b500f2d7fc6d) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm.lock.json` now takes each harness package's integrity and tarball URL from `pnpm-lock.yaml` and Yarn 1's `yarn.lock` too, so `harnesspm fetch` checks its downloads in pnpm and Yarn projects. For a lock without them, `fetch` reads the package manager's lockfile, and it names each package it cannot check.

- [#9](https://github.com/tenphi/harnesspm/pull/9) [`2d69197`](https://github.com/tenphi/harnesspm/commit/2d69197802d6ab483ac8b72143c2b500f2d7fc6d) Thanks [@tenphi](https://github.com/tenphi)! - The managed block now has a blank line after its BEGIN marker and before its END marker, so Prettier no longer changes it and breaks `sync --check`. A block in the old form still passes `--check`, and the next `sync` rewrites it once.

- [#9](https://github.com/tenphi/harnesspm/pull/9) [`2d69197`](https://github.com/tenphi/harnesspm/commit/2d69197802d6ab483ac8b72143c2b500f2d7fc6d) Thanks [@tenphi](https://github.com/tenphi)! - Outside a git repository, `harnesspm sync` no longer creates `.git/harnesspm/state.json`. It keeps that per-machine state in `~/.harnesspm/state/` instead.

## 0.3.0

### Minor Changes

- [#5](https://github.com/tenphi/harnesspm/pull/5) [`40154b6`](https://github.com/tenphi/harnesspm/commit/40154b6fd8430324f883fcd73ba80085f47c6e5e) Thanks [@tenphi](https://github.com/tenphi)! - New `harnesspm doctor`: checks that a repository is ready for harnesses, its own and a person's. Every per-machine file on disk must be ignored by git and not tracked, so no commit can include it. It also checks that added harnesses are on this machine, that outputs are in place, and what waits for trust. Each problem names the command that fixes it. `status` points to it when a per-machine file has a problem.

### Patch Changes

- [#5](https://github.com/tenphi/harnesspm/pull/5) [`40154b6`](https://github.com/tenphi/harnesspm/commit/40154b6fd8430324f883fcd73ba80085f47c6e5e) Thanks [@tenphi](https://github.com/tenphi)! - A telemetry command handler that exits without reading its event is now logged with its exit code, not as `EPIPE`.

## 0.2.0

### Minor Changes

- [#3](https://github.com/tenphi/harnesspm/pull/3) [`0aa47d8`](https://github.com/tenphi/harnesspm/commit/0aa47d8eca675a4de1f70b7ba8b5ace1515127ea) Thanks [@tenphi](https://github.com/tenphi)! - Opt-in telemetry: with `telemetry` in `harnesspm.json`, harnesspm sends events about script runs, MCP server starts, `sync` and `why` to the team's own handler, a command or a JSON Lines file. With agent events on, its own async hooks also report when Claude Code reads a harness file or loads a skill, and when a Claude Code or Codex session starts. Events never hold arguments, file contents or prompts. A handler gets events only after a person's `sync` records it in the lock, and a person opts out with `DO_NOT_TRACK=1` or `"telemetry": false` in `harnesspm.local.json`.

### Patch Changes

- [#3](https://github.com/tenphi/harnesspm/pull/3) [`0aa47d8`](https://github.com/tenphi/harnesspm/commit/0aa47d8eca675a4de1f70b7ba8b5ace1515127ea) Thanks [@tenphi](https://github.com/tenphi)! - harnesspm's own config rule loads only for the project's `harnesspm.json` and `harness/`, no longer when Claude Code reads a dependency's harness files.

- [#3](https://github.com/tenphi/harnesspm/pull/3) [`0aa47d8`](https://github.com/tenphi/harnesspm/commit/0aa47d8eca675a4de1f70b7ba8b5ace1515127ea) Thanks [@tenphi](https://github.com/tenphi)! - An `extends` entry that is an optional peer dependency of its package (`optional: true` in `peerDependenciesMeta`) is skipped without a warning when it is not installed.

- [#3](https://github.com/tenphi/harnesspm/pull/3) [`0aa47d8`](https://github.com/tenphi/harnesspm/commit/0aa47d8eca675a4de1f70b7ba8b5ace1515127ea) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm why` explains every unit ID: scripts, hooks, MCP servers, sub-agents and permissions too, not only rules, skills and docs. For a script it also shows the command that runs it, and for an executable unit of a dependency whether its package is trusted.

## 0.1.1

### Patch Changes

- [#1](https://github.com/tenphi/harnesspm/pull/1) [`67528c5`](https://github.com/tenphi/harnesspm/commit/67528c50345a909066448fa0eba4c272b3f73aeb) Thanks [@tenphi](https://github.com/tenphi)! - Releases are now published from GitHub Actions through npm trusted publishing, with provenance.

## 0.1.0

The first release: a proof of concept that covers every scenario of the [specification](docs/spec/README.md) (version 0.7 draft).

- **Team harness:** `init`, `sync`, `sync --check`, `status`, `why` and `check`. Discovery from dependencies, `extends`, one version per package, `exclude`, `replace` and `patch`, the managed block in `AGENTS.md`, skill and rule links, a docs index and `harnesspm.lock.json`.
- **Added harnesses:** `add`, `remove` and `update`, for a team's or a person's own harness on top of a repository, with user and local scope, project entries and a `SessionStart` hook.
- **Executables and trust:** scripts, hooks, MCP servers, permissions and sub-agents for Claude Code and Codex; `trust` with `true` or `"pin"`; `run`, `mcp` and `approve`. Nothing that widens an agent's permissions is written when the agent's model runs harnesspm.
- **Monorepos, `fetch` and `new`:** a block per workspace; downloading the locked harness packages for jobs without an install; templates for every unit kind and for patches.
- **Package:** published as `@tenphi/harnesspm`; the command is `harnesspm`. Commands that may run without an install use `npx -y @tenphi/harnesspm`, and allow rules for an added harness's scripts match those commands.
- **Docs index:** built from `.md` and `.mdx` pages, titled by frontmatter `title`, else the first heading. Found by the first pilot, `@tenphi/glaze`.
- **`check`:** `files` may list entries inside the docs folder, such as `docs/components` or `docs/*.md`, so a package can leave contributor docs out. Found by the `@cube-dev/ui-kit` pilot.

Known limits: `npm install <pkg>` and `pnpm add` do not run the install hook, so run `npx harnesspm sync` after them; Codex outputs are checked against its source and docs only; Yarn Plug'n'Play and Windows are not tested.
