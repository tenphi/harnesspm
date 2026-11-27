# Changelog

## 0.18.2

### Patch Changes

- [#97](https://github.com/tenphi/harnesspm/pull/97) [`ba479c9`](https://github.com/tenphi/harnesspm/commit/ba479c95c126c8e822c6a50980b660e31051efd9) Thanks [@tenphi](https://github.com/tenphi)! - `init` adds no install hook when a Yarn plugin in `.yarnrc.yml` already runs harnesspm, so each install syncs once, not twice. `sync` and `fetch` now remove the links in `node_modules/.harnesspm/pkgs/` that they no longer write, such as the one a move from `@tenphi/harnesspm` left behind.

## 0.18.1

### Patch Changes

- [#95](https://github.com/tenphi/harnesspm/pull/95) [`92e4db0`](https://github.com/tenphi/harnesspm/commit/92e4db0e406306c90fbfb3fb153b6ca9b84936d3) Thanks [@tenphi](https://github.com/tenphi)! - In a Claude Code cloud session, the step that turns on a package's tools now says why it differs: the session gives the person no terminal, so the environment's setup script grants it before each new session. `init`'s report there asks the person to commit the trust change and to add the project's install to the setup script, without the unrelated `add <source>`.

## 0.18.0

### Minor Changes

- [#93](https://github.com/tenphi/harnesspm/pull/93) [`11d3b41`](https://github.com/tenphi/harnesspm/commit/11d3b410a123425ff02e44bc1207d6453985ac44) Thanks [@tenphi](https://github.com/tenphi)! - Every task starts with one command. `npx -y @harnesspm/cli` in a folder that does not use harnesspm says what the folder is and names the command for each task; in a project it prints the project's report, which `status` and `doctor` now share (`doctor` still exits 1 when a check fails). `init` installs `@harnesspm/cli` as a dev dependency with the project's package manager (it stops on Yarn Plug'n'Play), adds `/.harnesspm/` to `.gitignore` once, and ends with a report: the tools that wait for the person's trust, with what each does and whether it runs without a prompt, the files to commit and the check for CI. Every step for a person is now `approve`, listed under one "Waiting for a person" heading in `sync`, `init` and the report. `help` in a project leads with its packages and marks tools that run without a prompt, `--help` lists every command, and `new` names the next step for the folder: publishing a library's harness, or adding a harness of your own.

## 0.17.0

### Minor Changes

- [#90](https://github.com/tenphi/harnesspm/pull/90) [`581562b`](https://github.com/tenphi/harnesspm/commit/581562b204c2d843fdf7f68ff581f1f739138995) Thanks [@tenphi](https://github.com/tenphi)! - harnesspm moved to the npm package `@harnesspm/cli`. The command is still `harnesspm`. To move a project, run `npm i -D @harnesspm/cli && npm rm @tenphi/harnesspm`, then `npx -y @harnesspm/cli init`; `doctor` reminds you. On each machine with an added harness, run `npx -y @harnesspm/cli update` once: the user-level `SessionStart` hook still runs `@tenphi/harnesspm`, which cannot rewrite itself. Every text, message, managed block and hook now uses one form, `npx -y @harnesspm/cli`, never the bare `npx harnesspm`, also as the fallback of hooks and MCP servers. The block's first line changes, so `sync --check` fails once in CI: run `sync` and commit `AGENTS.md`. Until harnesspm 1.0, the earlier name and the bare form keep working: the installed `@tenphi/harnesspm`, its hooks and allow rules, and the install script carry over at the next sync, and nothing needs approving again.

### Patch Changes

- [#92](https://github.com/tenphi/harnesspm/pull/92) [`bc9525d`](https://github.com/tenphi/harnesspm/commit/bc9525de219341080e5d9a4f8532fa6feec54d12) Thanks [@tenphi](https://github.com/tenphi)! - The docs site has one guide for people and their agents, in place of a part for each. Get started, Share a harness from your library and Add your own harness each open with the prompt for your agent and then have every step. The README links to them, and the old `/getting-started`, `/share` and `/bring-your-own` pages redirect there.

## 0.16.0

### Minor Changes

- [#88](https://github.com/tenphi/harnesspm/pull/88) [`9d9cfea`](https://github.com/tenphi/harnesspm/commit/9d9cfeac534f5106abcbf05639e420dba8fa79b9) Thanks [@tenphi](https://github.com/tenphi)! - `why <ID>` finds a unit of a project entry from any folder, such as another repository or a folder above the clones, where an agent may meet the IDs that a repository's `CLAUDE.local.md` lists. It searches the entries of the harnesses you added with user scope, and its owner line names the remotes the entry is for.
  
  `check` validates a harness's project entries too: the rules and skills in each entry folder, and the `name` in the entry's `plugin.json`, which `sync` refuses when it differs from the harness's. It checks each folder once, also when several remotes map to it, and prints each entry's always-on size next to the harness's.
  
  When `run` refuses a script because the installed version differs from the lock, the message now names both remedies: reinstall the project's dependencies when the install is out of date, as in a cached cloud environment, or run `npx -y @tenphi/harnesspm sync` when the lock is. It named only `sync` before, which on an old install writes the old versions into the lock.
  
  harnesspm is no longer labeled experimental: the README, the docs site and the spec drop the "experimental" note.

## 0.15.0

### Minor Changes

- [#84](https://github.com/tenphi/harnesspm/pull/84) [`609f227`](https://github.com/tenphi/harnesspm/commit/609f227f1271bbde1eff40c22d903b78e233ffe4) Thanks [@tenphi](https://github.com/tenphi)! - A sync in a folder above git repositories, such as `/home/user` in a Claude Code cloud session with several repositories, now applies your added harnesses in each repository right below it, so their project entries work there too. The `SessionStart` hook runs it at the start of such a session. Each repository gets only the per-machine outputs of your added harnesses; its own files, committed or per machine, stay as its install wrote them. A session that starts above the repositories reads the entries' rules and skills; their hooks and permissions still need a session that starts in the repository. Without added harnesses, and with `CI=true`, nothing changes.

- [#84](https://github.com/tenphi/harnesspm/pull/84) [`631a06e`](https://github.com/tenphi/harnesspm/commit/631a06e291fe60ccd241b033c3ab282e0f428e3b) Thanks [@tenphi](https://github.com/tenphi)! - The `SessionStart` hook that `add` installs now runs `update`, so each session starts with the newest commits of your added harnesses, also in a cloud session that starts from a days-old snapshot. In the hook, git never prompts, a fetch stops after 30 seconds, and a fetch that fails only warns: the session starts with what is on the machine. Working copies with uncommitted or unpushed work are left as they are. Your next `sync` turns the old hook, which ran `sync`, into the new one. `update` now prints what changed, such as `updated a1b2c3d → e4f5a6b`, instead of "up to date". New commits apply their hooks and permissions too: for a harness whose pushes you do not control, use an npm source with a fixed version, or `--no-hook`.

### Patch Changes

- [#84](https://github.com/tenphi/harnesspm/pull/84) [`121baa4`](https://github.com/tenphi/harnesspm/commit/121baa4745e57730535e648a953fa272f16a34d5) Thanks [@tenphi](https://github.com/tenphi)! - The user-level blocks in `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` show absolute paths for the on-demand rules, file-scoped rules and docs of added harnesses from git and npm sources, as the spec says. They showed paths such as `harnesses/<name>/harness/…`, relative to `~/.harnesspm`, which an agent could not open from a repository. Run `npx -y @tenphi/harnesspm sync` once to rewrite them.

## 0.14.0

### Minor Changes

- [#82](https://github.com/tenphi/harnesspm/pull/82) [`d18418b`](https://github.com/tenphi/harnesspm/commit/d18418b3c88aeee62608dedc217c90e55818edcc) Thanks [@tenphi](https://github.com/tenphi)! - The copies of dependencies' docs move out of `node_modules`, to `.harnesspm/docs/` at the project root. After upgrading, run `sync` and commit `AGENTS.md`, whose `Docs:` lines change, and add `/.harnesspm/` to `.gitignore` so formatters such as Prettier skip the copies: `sync` warns until it is there. A `.rgignore` of your own needs the lines `!/.harnesspm/`, `/.harnesspm/*` and `!/.harnesspm/docs/` instead of the `node_modules` ones. `sync` removes the old copies, and both `sync` and `fetch` write the copies only where git ignores them.

## 0.13.2

### Patch Changes

- [#80](https://github.com/tenphi/harnesspm/pull/80) [`4e76974`](https://github.com/tenphi/harnesspm/commit/4e76974bf1e5fc02d889db73299f66c8e8442af6) Thanks [@tenphi](https://github.com/tenphi)! - The docs copy points a link that leaves the docs folder, such as `../README.md`, at that file in the installed package, so it leads somewhere. `check` no longer warns on such links: a docs page keeps the links its own website needs.

## 0.13.1

### Patch Changes

- [#78](https://github.com/tenphi/harnesspm/pull/78) [`f4a64da`](https://github.com/tenphi/harnesspm/commit/f4a64da614caa6b8ea5aa7955235c61e595e27d8) Thanks [@tenphi](https://github.com/tenphi)! - `check` warns when a docs page links to a file outside the docs folder, such as `../README.md`, because that link leads nowhere in the docs copy that projects search. It does not fail the check.

## 0.13.0

### Minor Changes

- [#76](https://github.com/tenphi/harnesspm/pull/76) [`f05605c`](https://github.com/tenphi/harnesspm/commit/f05605c59ad7b7e02838a0d096a6dd28ff7de5fd) Thanks [@tenphi](https://github.com/tenphi)! - `sync` and `fetch` copy every dependency's docs into `node_modules/.harnesspm/docs/`, and write a `.rgignore` that lets agents' search tools, such as Claude Code's Grep and `rg`, into that one folder. Search skipped a dependency's docs before, because they sit in `node_modules`. Git ignores the copies and the `.rgignore`, and formatters skip `node_modules`. The `Docs:` lines in the managed block now point at the copies: run `npx harnesspm sync` after upgrading and commit `AGENTS.md`.

## 0.12.1

### Patch Changes

- [#74](https://github.com/tenphi/harnesspm/pull/74) [`3d44214`](https://github.com/tenphi/harnesspm/commit/3d442145867bf59ee65cb2de32fcfd849383f2b3) Thanks [@tenphi](https://github.com/tenphi)! - A `sync` event names what differs from the reviewed state `reason`, not `why`, which is already an event type, and its `held` entries leave out the `-C <path>` of a hook above the project, so events carry no local paths.

## 0.12.0

### Minor Changes

- [#72](https://github.com/tenphi/harnesspm/pull/72) [`c14bc7d`](https://github.com/tenphi/harnesspm/commit/c14bc7d07e1ff39b841795a544bd61f7518a9816) Thanks [@tenphi](https://github.com/tenphi)! - Telemetry events from a git worktree carry `worktree: true`, such as those of a Claude Code desktop app session that runs in one, and a `sync` event lists the entries an agent's sync held back, with `held` and `why`.

## 0.11.0

### Minor Changes

- [#70](https://github.com/tenphi/harnesspm/pull/70) [`9ffd4cb`](https://github.com/tenphi/harnesspm/commit/9ffd4cb016ba7121d26a72f9f9360e642f675f84) Thanks [@tenphi](https://github.com/tenphi)! - Sessions that start in a folder above your repositories, such as a Claude Code cloud session with several repositories or your folder of clones, now get each repository's hooks: run `npx -y @tenphi/harnesspm sync` in that folder once, after the installs. It writes the hooks with `-C <repository>` into that folder's agent settings, and a block in its `AGENTS.md` that names each repository, its rules and its `help` command; each repository's own sync keeps its entries there current, and a sync there removes the entries of repositories that are gone. Such a hook runs in its repository and skips edits in the others. An agent's own sync never adds hooks there. Telemetry hook events now use the session ID that Claude Code's commands see, so a session's hook and command events no longer split into two sessions, and events from such a folder carry `outside: true`.

## 0.10.1

### Patch Changes

- [#66](https://github.com/tenphi/harnesspm/pull/66) [`690bd5e`](https://github.com/tenphi/harnesspm/commit/690bd5ed1a0d6207ba767d20c45026e305f528f8) Thanks [@tenphi](https://github.com/tenphi)! - Keep monorepo rule patches and replacements scoped to the workspaces that use them, and keep the original skill when consumers disagree.

## 0.10.0

### Minor Changes

- [#63](https://github.com/tenphi/harnesspm/pull/63) [`38b7d55`](https://github.com/tenphi/harnesspm/commit/38b7d55bc8eb663ae91ef597f828e8c76cb91690) Thanks [@tenphi](https://github.com/tenphi)! - `replace` now works on skills: map a skill ID to a folder with its own `SKILL.md`, which keeps the skill's name, ID and place. A package that passes on another package's harness can adapt an upstream skill for its users, and the folder is not a skill of its own, so nothing warns about two skills with one name. A replaced skill gets the trust of the package that replaced it. For other units, such as tools and hooks, `replace` warns and points to `exclude`, and `check` fails on it; the spec now says so.

### Patch Changes

- [#63](https://github.com/tenphi/harnesspm/pull/63) [`38b7d55`](https://github.com/tenphi/harnesspm/commit/38b7d55bc8eb663ae91ef597f828e8c76cb91690) Thanks [@tenphi](https://github.com/tenphi)! - A docs folder of your own harness that your build writes and git ignores no longer makes the lock and the `AGENTS.md` blocks depend on whether a build ran: `sync` leaves it out, built or not, and `check` still reads the built pages. An `exclude` of that docs unit no longer warns that it does not exist.

- [#63](https://github.com/tenphi/harnesspm/pull/63) [`38b7d55`](https://github.com/tenphi/harnesspm/commit/38b7d55bc8eb663ae91ef597f828e8c76cb91690) Thanks [@tenphi](https://github.com/tenphi)! - A project in a subfolder of a git repository, such as `docs-site/`, now keeps its per-machine files out of git: `sync` writes its entries in `.git/info/exclude` from the git root (`/docs-site/.claude/skills/…`), in a section named after its folder, and keeps its own state file, so two projects in one repository never touch each other's entries. The next sync moves the entries an older version wrote into the root's section. A hook already in a settings file is not added a second time. `doctor` names the `!` pattern and file that bring a file back, and asks for a sync when no pattern matches.

## 0.9.2

### Patch Changes

- [#60](https://github.com/tenphi/harnesspm/pull/60) [`9d6b32f`](https://github.com/tenphi/harnesspm/commit/9d6b32fb711fa79bcc280b83a938c62dbf7253d1) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm check` no longer checks links in code samples (fenced code blocks and code spans), so a sample link no longer fails the check. A link in an indented code block still counts: put a sample link in a fence.

## 0.9.1

### Patch Changes

- [#58](https://github.com/tenphi/harnesspm/pull/58) [`3fa6145`](https://github.com/tenphi/harnesspm/commit/3fa61450bfe449e4e7d53a7b4dbda5624db650d1) Thanks [@tenphi](https://github.com/tenphi)! - `harnesspm check` judges a package by what its tarball would hold, read from `files` in `package.json`. It now checks docs pages built at `prepack`, which git ignores but npm packs, and reports a link to a file the package does not ship. Links in `.mdx` pages are checked too. The private-key warning now needs a key body, so a `-----BEGIN PRIVATE KEY-----` placeholder in docs no longer triggers it. The spec's links to `docs/research/`, which doesn't ship, now lead to GitHub.

## 0.9.0

### Minor Changes

- [#50](https://github.com/tenphi/harnesspm/pull/50) [`5c97e3a`](https://github.com/tenphi/harnesspm/commit/5c97e3acfa89a50db4ef8a6d7e34b619279e3679) Thanks [@tenphi](https://github.com/tenphi)! - Scripts can list their `answers` exit codes (such as `[1]` for a lint that found problems): `run` events get an `outcome` of `ok`, `answer` or `failed`, `reportRun` takes `answers` too, and `help <tool>` prints them. `run`, `help` and `why` events from a folder outside the project, such as with `-C`, carry `outside: true`.

## 0.8.0

### Minor Changes

- [#44](https://github.com/tenphi/harnesspm/pull/44) [`d9b558f`](https://github.com/tenphi/harnesspm/commit/d9b558fb73a8d914437d8f0a34a66e189ed24701) Thanks [@tenphi](https://github.com/tenphi)! - Use a cloned repository's harness from another folder: `harnesspm -C <dir> <command>` acts on the project in `<dir>`, `help` lists the project's scripts, MCP servers, rules, docs and skills (fetching its harness packages first when it has no install), `run` and `mcp` use fetched packages and say what is missing instead of `No script`, and the managed block starts with a line for agents outside the folder and gives tools as `npx -y @tenphi/harnesspm run <unit>`.

- [#47](https://github.com/tenphi/harnesspm/pull/47) [`c300231`](https://github.com/tenphi/harnesspm/commit/c30023153ced717ec184ed2b94358a9bcdf1ff47) Thanks [@tenphi](https://github.com/tenphi)! - Rules are no longer inlined in AGENTS.md; agents get them with `help <package>`. The managed block now starts with the commands that reach the harness, then names each always-on rule in one line (its title and section headings), and lists tools by name without repeating the run command. `harnesspm help <package>` prints a package's rules in full with your patches, its docs, tools, MCP servers, skills and hooks; `help <rule ID>` prints one rule; `help <tool>` prints a tool's usage and run command without running it, from a new optional `usage` field in the script's manifest entry. All work with `-C` and without an install, and `help` with a target is a new telemetry event.

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
