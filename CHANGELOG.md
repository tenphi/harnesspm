# Changelog

## 0.7.0

### Minor Changes

- [#39](https://github.com/tenphi/harnesspm/pull/39) [`9968789`](https://github.com/tenphi/harnesspm/commit/996878997b6fbb1f2467c9353d3772c78473583d) Thanks [@tenphi](https://github.com/tenphi)! - Until a package is trusted, its sub-agents are written without Claude Code's `hooks` and `mcpServers`, as `permissionMode` already was, and a skill of its that sets `allowed-tools` or `hooks` is linked as a copy without them. Claude Code ignores the same sub-agent keys in plugins for security. `sync` names each key it leaves out.

- [#39](https://github.com/tenphi/harnesspm/pull/39) [`9968789`](https://github.com/tenphi/harnesspm/commit/996878997b6fbb1f2467c9353d3772c78473583d) Thanks [@tenphi](https://github.com/tenphi)! - Package headings in the managed block no longer name the version, so an upgrade that keeps a package's harness the same changes only `harnesspm.lock.json`. Run `npx harnesspm sync` once and commit the updated `AGENTS.md` files.

## 0.6.0

### Minor Changes

- [#37](https://github.com/tenphi/harnesspm/pull/37) [`d95e966`](https://github.com/tenphi/harnesspm/commit/d95e96674973bf2ef0fab4c04fc1abd810ff9b99) Thanks [@tenphi](https://github.com/tenphi)! - When an agent runs the install, harnesspm now writes the hooks, MCP servers and allow rules that the default branch already records, so a teammate's merged change reaches every machine with no step. The agent's own edits still wait for a person, and the held-back line now says what differs, such as `harnesspm.json differs from origin/main`.

## 0.5.2

### Patch Changes

- [#34](https://github.com/tenphi/harnesspm/pull/34) [`c0f7a2b`](https://github.com/tenphi/harnesspm/commit/c0f7a2ba0a78d424d8af708c40a802b327b54d9f) Thanks [@tenphi](https://github.com/tenphi)! - In a Claude Code cloud session, `sync`, `status` and `doctor` now print the exact line for the environment's setup script when they hold entries back, such as `cd /home/user/app && npm ci`, and the cloud docs give a setup script that works.

## 0.5.1

### Patch Changes

- [#31](https://github.com/tenphi/harnesspm/pull/31) [`8449c71`](https://github.com/tenphi/harnesspm/commit/8449c71afddb966d5f26d4e0d6602414ef6ff9ea) Thanks [@tenphi](https://github.com/tenphi)! - Hooks and MCP servers start harnesspm as `node <project>/node_modules/@tenphi/harnesspm/dist/cli.js`, and the package ships `dist/cli.js` as executable, so hooks keep working after Yarn 4 upgrades harnesspm in place.

## 0.5.0

### Minor Changes

- [#28](https://github.com/tenphi/harnesspm/pull/28) [`8febc83`](https://github.com/tenphi/harnesspm/commit/8febc8398ce14be9066b78a8292710a90468b1bb) Thanks [@tenphi](https://github.com/tenphi)! - `status` and `doctor` name each managed block that Codex never reads, or reads only in part, such as a workspace block below a long root `AGENTS.md`.

- [#28](https://github.com/tenphi/harnesspm/pull/28) [`8febc83`](https://github.com/tenphi/harnesspm/commit/8febc8398ce14be9066b78a8292710a90468b1bb) Thanks [@tenphi](https://github.com/tenphi)! - The root block of a monorepo names the workspaces that have harness rules of their own, and a trusted hook that checks file edits gets a line asking agents to edit with their file tools.

- [#28](https://github.com/tenphi/harnesspm/pull/28) [`8febc83`](https://github.com/tenphi/harnesspm/commit/8febc8398ce14be9066b78a8292710a90468b1bb) Thanks [@tenphi](https://github.com/tenphi)! - New `@tenphi/harnesspm/telemetry` entry with `reportRun`, so a project's own tools send `run` events to the same handler. The package now has an `exports` field, so deep imports of internal files no longer resolve.

- [#28](https://github.com/tenphi/harnesspm/pull/28) [`8febc83`](https://github.com/tenphi/harnesspm/commit/8febc8398ce14be9066b78a8292710a90468b1bb) Thanks [@tenphi](https://github.com/tenphi)! - Telemetry: loading a workspace's rules sends `read` events, events carry a `repository` field from the `origin` remote, and a sync in CI sends no `sync` event.

### Patch Changes

- [#28](https://github.com/tenphi/harnesspm/pull/28) [`8febc83`](https://github.com/tenphi/harnesspm/commit/8febc8398ce14be9066b78a8292710a90468b1bb) Thanks [@tenphi](https://github.com/tenphi)! - In a Claude Code cloud session, held-back entries point to the environment's setup script instead of asking for a terminal the person does not have.

- [#28](https://github.com/tenphi/harnesspm/pull/28) [`8febc83`](https://github.com/tenphi/harnesspm/commit/8febc8398ce14be9066b78a8292710a90468b1bb) Thanks [@tenphi](https://github.com/tenphi)! - `status` and `doctor` list the same held-back entries as `sync`, now with Codex allow rules and a held telemetry handler, so the counts match.

- [#28](https://github.com/tenphi/harnesspm/pull/28) [`8febc83`](https://github.com/tenphi/harnesspm/commit/8febc8398ce14be9066b78a8292710a90468b1bb) Thanks [@tenphi](https://github.com/tenphi)! - Hooks and stdio MCP servers start through the project's own `node_modules/.bin/harnesspm` when it exists, not through npx, which saves about 0.4 s on every hooked tool call. Allow rules keep the npx form.

- [#28](https://github.com/tenphi/harnesspm/pull/28) [`7830b5c`](https://github.com/tenphi/harnesspm/commit/7830b5c760f2211bc17a4cebfd069fb2bb9668f4) Thanks [@tenphi](https://github.com/tenphi)! - `status` and `doctor` count the `AGENTS.md` files above a project that sits below the git root, a workspace's rules count once per load, one hook run starts one telemetry handler process, and the edit-hook line reads Codex matchers as regular expressions.

## 0.4.4

### Patch Changes

- [#19](https://github.com/tenphi/harnesspm/pull/19) [`d9f9fdc`](https://github.com/tenphi/harnesspm/commit/d9f9fdc8dbf2a61168f0164b1b70e5ae88c8bfda) Thanks [@tenphi](https://github.com/tenphi)! - Docs leave out the files git ignores. A local file next to the pages, such as an agent's plan, no longer changes the lock, the docs index or `check` on one machine only, so `sync --check` in CI agrees with a local sync.

## 0.4.3

### Patch Changes

- [#18](https://github.com/tenphi/harnesspm/pull/18) [`16ec137`](https://github.com/tenphi/harnesspm/commit/16ec1374e9eb1b01591b98bef57ca34f85582c96) Thanks [@tenphi](https://github.com/tenphi)! - Clearer CLI messages. A pending tool's reason now says that a person turns it on, so agents do not take it as their next step. `init` ends with the files to commit. `new` lists every file it wrote, `plugin.json` included, and a next step that works where it wrote. `harnesspm <command> --help` shows that command's usage and options.

- [#16](https://github.com/tenphi/harnesspm/pull/16) [`08c0f45`](https://github.com/tenphi/harnesspm/commit/08c0f452244c1bd124e2c11ce167990dc99a6e13) Thanks [@tenphi](https://github.com/tenphi)! - The install script that `harnesspm init` writes skips `harnesspm sync` when harnesspm is not installed, so an install without dev dependencies, such as `npm ci --omit=dev`, no longer fails with "harnesspm: not found". In a project that is already set up, run `npx harnesspm init` again to update the script; `harnesspm doctor` warns until you do.

## 0.4.2

### Patch Changes

- [#15](https://github.com/tenphi/harnesspm/pull/15) [`1c6d5b4`](https://github.com/tenphi/harnesspm/commit/1c6d5b4e3c26a44699fc57b1ab97e59831729048) Thanks [@tenphi](https://github.com/tenphi)! - A docs unit's hash in `harnesspm.lock.json` now covers only its `llms.txt` and its `.md` and `.mdx` pages. A package that points `docs` at its source folder, with pages next to the code, no longer gets a stale lock from every change to a source or test file. The next `sync` rewrites the hash of a docs folder that holds other files.

- [#13](https://github.com/tenphi/harnesspm/pull/13) [`8acfdf3`](https://github.com/tenphi/harnesspm/commit/8acfdf372af46d908710ba1401786e646b776e3c) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm init` stops when `@tenphi/harnesspm` is not a dependency of the project, changes nothing, and names the command that installs it. Before, it added an install script that failed the next install with "harnesspm: not found".

- [#13](https://github.com/tenphi/harnesspm/pull/13) [`71e2aab`](https://github.com/tenphi/harnesspm/commit/71e2aabc193953fc3c5c3f9440594d1426a75579) Thanks [@tenphi](https://github.com/tenphi)! - The `harnesspm-import` and `harnesspm-export` skills name every file to commit, say where to find what a pending tool does, show the `docs` field in full, and add a README note for the package's users.

## 0.4.1

### Patch Changes

- [#10](https://github.com/tenphi/harnesspm/pull/10) [`f4a5899`](https://github.com/tenphi/harnesspm/commit/f4a5899c50aebc18e0c9d6cf18669723c11f29e6) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm sync` no longer fails when a docs page of a package has invalid frontmatter: it warns and lists the page by its heading or file name. `harnesspm check` reports such a page, so the author fixes it before publishing.

- [#10](https://github.com/tenphi/harnesspm/pull/10) [`d8df8e9`](https://github.com/tenphi/harnesspm/commit/d8df8e97f9c554fb6beb6a50082c97e75eb05be2) Thanks [@tenphi](https://github.com/tenphi)! - The specification, which ships as the docs of harnesspm's own harness, shows the managed block as `sync` writes it and calls harnesspm experimental.

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
