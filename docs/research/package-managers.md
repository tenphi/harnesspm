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

Also observed: pnpm's `node_modules/.pnpm` layout needs no special case. Resolving `extends` from each package's real folder finds the dependencies pnpm links next to it.

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
