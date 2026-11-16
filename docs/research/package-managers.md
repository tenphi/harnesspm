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
- 🔍 An install without dev dependencies still runs the project's `postinstall`. In a private app that `init` set up, `npm ci --omit=dev` failed with `sh: 1: harnesspm: not found` and npm error code 127 (npm 10.9.9, Nov 2026). The same happens when `init` runs in a project that never installed harnesspm.

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

`npx` adds about 290 ms, which a hook pays on every matching tool call. Two ways to cut it, not taken yet: write hook commands with `node_modules/.bin/harnesspm` instead of `npx harnesspm`, and let `run` read an index that `sync` writes instead of resolving every package.

## Package name

- 🔍 npm refused the first publish of the bare name `harnesspm` with `E403 You do not have permission to publish "harnesspm"`, from an account that was logged in. The registry had no package by that name and none by `harness-pm`, `harness_pm` or `harness.pm` (all 404, Nov 2026), so npm most likely holds the name.
- The package is `@tenphi/harnesspm`, in its owner's scope, so nobody else can take or block it. The command stays `harnesspm`, so `npx harnesspm …` works wherever it is installed.
- Commands that may run where it is not installed name the scope: `npx -y @tenphi/harnesspm …`. A bare `npx -y harnesspm` would download whatever package someone else later publishes as `harnesspm`.
