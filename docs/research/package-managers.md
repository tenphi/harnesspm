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
