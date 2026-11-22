# Package managers and install hooks

When each package manager runs a project's own `prepare` and `postinstall` scripts. harnesspm relies on them to run `harnesspm sync` after an install ([spec 10.1](../spec/10-cli.md#101-projects)).

🔍 Observed in the proof of concept in November 2026, with Node.js 22.23.4, npm 10.9.9, pnpm 10.28.0, Yarn 1.22.22 and Yarn 4.9.1 (`nodeLinker: node-modules`). Each row deleted `AGENTS.md`, ran the command, and checked whether `harnesspm sync` wrote it again.

| Command | `prepare` | `postinstall` |
| --- | --- | --- |
| `npm install` | ✅ | ✅ |
| `npm ci` | ✅ | ✅ |
| `npm install <pkg>`, `npm uninstall <pkg>` | ❌ | ❌ |
| `pnpm install`, `pnpm install --frozen-lockfile` | ✅ | ✅ |
| `pnpm add <pkg>`, `pnpm remove <pkg>` | ❌ | ❌ |
| Yarn 1 `yarn install`, `yarn add <pkg>` | ✅ | ✅ |
| Yarn 4 `yarn install`, `yarn add <pkg>` | ❌ | ✅ |

What follows for harnesspm:

- No script runs after `npm install <pkg>` or `pnpm add <pkg>`. After them, a person or an agent runs `npx harnesspm sync`. `harnesspm sync --check` in CI catches a missed one.
- `postinstall` of a published package also runs when others install it, so it is safe only in a private package. `prepare` does not run when a package is installed from a registry.
- So `init` uses `postinstall` in a private package, which covers Yarn 4, and `prepare` otherwise. A published package that uses Yarn 4 runs `yarn harnesspm sync` after installs.
- 🔍 An install without dev dependencies still runs the project's `postinstall`. In a private app that `init` set up, `npm ci --omit=dev` failed with `sh: 1: harnesspm: not found` and npm error code 127 (npm 10.9.9, Nov 2026).
- 🔍 The same failure followed `npx -y @tenphi/harnesspm init` in a project that never installed harnesspm: `init` exited with code 0, and the next `npm install` failed (harnesspm 0.4.1, Nov 2026). So `init` now stops when the project does not list the package as a dependency.

### The install hook without dev dependencies

So `init` writes an install hook that skips the sync when harnesspm is not installed ([spec 10.1](../spec/10-cli.md#the-install-hook)). 🔍 Observed with it in November 2026, on Linux:

| Package manager | Install without dev dependencies | Full install |
| --- | --- | --- |
| npm 10.9.9 | `npm ci --omit=dev` passes. Before, it failed with code 127. | `npm ci` runs the sync |
| npm 12.2.2 | `npm ci --omit=dev` passes | `npm ci` runs the sync |
| pnpm 10.28.0 | `pnpm install --prod` passes | `pnpm install` runs the sync |
| Yarn 1.22.22 | `yarn install --production` passes | `yarn install` runs the sync |
| Yarn 4.9.1, `nodeLinker: node-modules` | `yarn workspaces focus --production` passes. It does not run the project's `postinstall` at all. | `yarn install` runs the sync |

- The npm rows used a private app with the hook alone, and a published package with the hook in `prepare` after an existing script. The pnpm and Yarn rows used a private app with the hook after an existing script, `node -e "0" && (…)`.
- In Yarn 4's own shell, `yarn run postinstall` skipped the sync when harnesspm was not installed. With an existing script that exits with code 5 in front, it exited with code 5. Without the parentheses, the sync would have run and hidden that failure.
- Windows cmd was not tested.

## Install scripts of dependencies

Can a package set up its own harness when a project installs it? Only an install script of the package could do that, and package managers no longer run those by default.

| Package manager | A dependency's `postinstall` | | Source |
| --- | --- | --- | --- |
| npm 10.9.9 | Runs. | 🔍 | Observed, Nov 2026 |
| npm 12.2.2 | Blocked, with a warning: "1 package had install scripts blocked because they are not covered by allowScripts". `npm install-scripts approve <pkg>` allows it. | 🔍 | Observed, Nov 2026 |
| pnpm | Blocked. "Packages not listed in `allowBuilds` are disallowed by default", and `strictDepBuilds` is `true` by default, so an install with unreviewed build scripts exits with an error. | ✅ | [build settings](https://pnpm.io/settings/build) |
| Bun | Blocked. "Bun does not execute arbitrary lifecycle scripts by default", only for packages in `trustedDependencies`. | ✅ | [lifecycle scripts](https://bun.com/docs/pm/lifecycle) |

🔍 The npm rows used a project with its own `postinstall` and `prepare`, and one dependency with a `postinstall`. With npm 12.2.2, `npm install` and `npm ci` ran both of the project's own scripts, and `npm install <pkg>` ran neither, as with npm 10.

What follows for harnesspm:

- A package cannot deliver its harness by itself. A project, or a person, takes one step first: `npx harnesspm init`, or `npx harnesspm add`. After that step, installs keep the harness current.
- The hook that `init` adds is the project's own script, so it still runs with npm 12.
- An install script in a harness package would not help. npm and Bun skip it, and with pnpm's defaults it fails the install of every project that uses the package.

Also observed: pnpm's `node_modules/.pnpm` layout needs no special case. Resolving `extends` from each package's real folder finds the dependencies pnpm links next to it.

## Lockfiles

`harnesspm.lock.json` copies each harness package's tarball URL and integrity from the package manager's lockfile, so `harnesspm fetch` can download and check it without an install ([spec 13.6](../spec/13-open-questions.md#136-ci-without-an-install)).

🔍 Observed in November 2026 with npm 10.9.9, pnpm 10.28.0 and Yarn 1.22.22, each after adding `@tenphi/glaze` 3.1.0 from the npm registry:

| Lockfile | Where a package is | URL | Integrity |
| --- | --- | --- | --- |
| `package-lock.json` (lockfile 3) | `packages["node_modules/<name>"]`, also nested under another package's `node_modules/` | `resolved` | `integrity` |
| `pnpm-lock.yaml` (lockfile 9.0) | `packages["<name>@<version>"]`. Lockfile 6.0 keys start with `/`, and keys may end with peer versions, such as `(react@18.3.1)`. A `file:` dependency keeps its version in `version`. | `resolution.tarball`, only for a package outside the registry | `resolution.integrity` |
| Yarn 1 `yarn.lock` | A block headed by every range that resolved to it, such as `"<name>@^3.0.0", "<name>@^3.1.0":` | `resolved`, with a `#<sha1>` fragment that harnesspm drops | `integrity` |

The integrity of `@tenphi/glaze` 3.1.0 was the same `sha512-…` in all three. With harnesspm 0.3.0, which read only `package-lock.json`, a pnpm project's lock had neither field, and `fetch` downloaded `<name>@<version>` with a warning that it was not checked. harnesspm does not read the lockfile of Yarn 2 and later yet.

## Runner speed

🔍 Measured in the proof of concept (Node.js 22.23.4, npm 10.9.9), for `harnesspm run` of a script that prints one line, in a project with two harness packages:

| Command | Time |
| --- | --- |
| `node -e 0` | 28 ms |
| `node node_modules/@tenphi/harnesspm/dist/cli.js run kit:probe` | about 150 ms |
| `npx harnesspm run kit:probe` | about 440 ms |

`npx` adds about 290 ms, which a hook pays on every matching tool call. Two ways to cut it: write hook commands without npx, and let `run` read an index that `sync` writes instead of resolving every package. 0.5.0 took the first with `node_modules/.bin/harnesspm`; 0.5.1 runs `node node_modules/@tenphi/harnesspm/dist/cli.js` instead, because of the file mode below. The second is not taken yet.

## The CLI file's mode

A hook that runs `node_modules/.bin/harnesspm` needs `dist/cli.js` to be executable. `node <file>` does not.

| Install | `dist/cli.js` | `node_modules/.bin/harnesspm --version` | |
| --- | --- | --- | --- |
| Yarn 4.9.1, `nodeLinker: node-modules`, fresh 0.4.4 | `rwxr-xr-x` | works | 🔍 |
| The same, upgraded in place to 0.5.0, whose tarball has `dist/cli.js` as `0644` | `rw-r--r--` | `Permission denied`, exit 126 | 🔍 |
| The same 0.5.0 project, upgraded in place to a tarball with `dist/cli.js` as `0755` | `rwxr-xr-x` | works | 🔍 |
| npm, a tarball with `0755` | `npm pack` keeps the mode | | 🔍 |

Yarn 4 writes the package's files with the tarball's modes on an upgrade in place, and skips its chmod because the `.bin` link already points at the same path. So the build makes `dist/cli.js` executable, and hooks and MCP servers start it with `node`. Observed Nov 2026 ([#30](https://github.com/tenphi/harnesspm/issues/30)).

## Package name

- 🔍 npm refused the first publish of the bare name `harnesspm` with `E403 You do not have permission to publish "harnesspm"`, from an account that was logged in. The registry had no package by that name and none by `harness-pm`, `harness_pm` or `harness.pm` (all 404, Nov 2026), so npm most likely holds the name.
- The package is `@tenphi/harnesspm`, in its owner's scope, so nobody else can take or block it. The command stays `harnesspm`, so `npx harnesspm …` works wherever it is installed.
- Commands that may run where it is not installed name the scope: `npx -y @tenphi/harnesspm …`. A bare `npx -y harnesspm` would download whatever package someone else later publishes as `harnesspm`.

## What a package ships

`check` judges a package by what its tarball would hold ([spec 2.10](../spec/02-package-format.md#210-validation)).

- 🔍 With `files` set, npm packs a file `files` lists even when the root `.gitignore` ignores it: `npm pack --dry-run --json` listed a git-ignored `docs/built.md` for `"files": ["docs/*.md"]` (npm 10.9.9, Nov 2026). So docs built at `prepack` ship, while git, and a check that asks git, never sees them.
- 🔍 `npm pack --dry-run --json --ignore-scripts` still runs the package's `prepare` script. It skips `prepack`, but in a test package a `prepare` script that prints a line still printed it, and so it did with `npm_config_ignore_scripts=true` (npm 10.9.9, Nov 2026). In `@cube-dev/ui-kit`, whose `prepare` is `husky install && harnesspm sync`, one listing took 4.8 s and ran a sync. So `check` reads `files` itself and never runs npm.
- This hid dead links in a real package: `@cube-dev/ui-kit` builds its docs into `docs/` at `prepack`, next to its tracked `docs/rules/`, and `check` read only `docs/rules/` ([#52](https://github.com/tenphi/harnesspm/issues/52)). Checked against what ships, harnesspm's own spec had 29 links into `docs/research/`, which doesn't ship. They now lead to GitHub.

## Git excludes below the git root

harnesspm keeps per-machine files out of git through `.git/info/exclude` ([spec 4.1](../spec/04-outputs.md#41-principles)).

- 🔍 A pattern in `.git/info/exclude` that starts with `/` is anchored at the top of the work tree, not at the folder git runs in. A project in `docs-site/` needs `/docs-site/.claude/`; `/.claude/` misses it (git 2.43, Nov 2026).
- 🔍 `git rev-parse --show-toplevel --show-prefix --git-path info/exclude` prints the top folder, the path from it to the current folder (`docs-site/`, or an empty line at the top), and the exclude file, one per line, in the order asked.
- 🔍 `git check-ignore -v -n` prints, for each path, the file and the pattern that decide it, also when that pattern starts with `!` and brings the path back. The file is named from the top of the work tree, such as `docs-site/.gitignore`. A path that no pattern matches gets empty fields. So `doctor` can tell a `!` pattern from an entry that matches nothing.
