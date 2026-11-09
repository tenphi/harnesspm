# 3. Resolution

Resolution turns many harness packages into one set of units for each workspace. It is deterministic: the same inputs always give the same outputs.

## 3.1 Layers

| # | Layer | Source | Committed? |
| --- | --- | --- | --- |
| 1 | 🌍 **Global personal** | Personal harnesses in `~/.tack/config.json` | — |
| 2 | 📦 **Dependencies** | Harness packages found in dependencies, and what they extend | through `package.json` |
| 3 | 🏢 **Project** | `tack.json` and the project's own `harness/` | yes |
| 4 | 🙋 **Local personal** | `tack.local.json`, `harness.local/`, and the `projects` entry of a personal harness | no |

A higher layer wins. It can add units, replace units by ID, and exclude units. Layers 1 and 4 are covered in [07-personal.md](07-personal.md).

Committed outputs MUST be computed from layers 2 and 3 only. Two teammates with different personal harnesses therefore produce identical committed files.

## 3.2 Discovery

For each workspace, Tack starts from that workspace's `dependencies`, `devDependencies` and `optionalDependencies`:

1. Resolve each dependency from the workspace folder, the way Node.js resolves a package.
2. Keep the dependency if it has a `harness/` folder (or a package-root `skills/` folder).
3. Follow `extends` of every kept package (see [3.3](#33-extends)).

Tack reads files only. It never runs code from a dependency during discovery.

By default every dependency with a harness is included. A project can narrow this in `tack.json`:

```json
{
  "include": ["@cube-dev/ui-kit", "@tenphi/entropy"],
  "exclude": ["@tenphi/glaze"]
}
```

## 3.3 Extends

`extends` lets a package pass on the harness of the packages it builds on.

```json
"extends": ["@tenphi/tasty", "@tenphi/glaze"]
```

1. Each name MUST be resolved **from the folder of the package that declares it**. The version is the one that package actually uses, even when it is not hoisted.
2. Tack follows `extends` recursively and stops on a cycle with an error.
3. Only `extends` passes harness on. A dependency's harness never reaches that dependency's consumers by itself. This keeps a library's development tools out of its users' projects.
4. A package's `exclude` and `replace` apply to what it passes on. A middle package can therefore change an upstream rule for all its consumers.

Example: an app depends only on `@cube-dev/ui-kit`. UI Kit extends Tasty and Glaze. The app gets the harness of all three, in the versions UI Kit installed.

## 3.4 Order and priority

Inside the dependency layer, packages are ordered **upstream first**: a package always comes after the packages it extends. Packages that do not depend on each other are ordered by name.

| Situation | Result |
| --- | --- |
| Two layers have a unit with the same ID | The higher layer wins. |
| `replace` names a unit | The replacement takes the unit's ID and place. |
| `exclude` names a unit or a package | It is dropped, together with everything only it extends. |
| Two packages ship a skill with the same name | The later one (higher layer, or downstream) wins, with a warning. |
| A `replace` or `exclude` names a unit that does not exist | Warning. It usually means an upstream unit was renamed. |

Always-on text appears in this order in the agent's instructions, so later layers are also read later.

## 3.5 One package, several versions

A package can be installed more than once with different versions.

1. A workspace's **direct** dependency wins.
2. Otherwise the copy closest to the workspace in the `extends` chain wins.
3. Tack prints a warning that names both versions.

## 3.6 The project's own harness

A project that publishes a harness also has one in its own repository. By default Tack includes it in the project layer, so the project's contributors see the same rules as its users. Set `"self": false` in `tack.json` to turn this off.

## 3.7 Monorepos

1. Tack resolves each workspace on its own, using that workspace's dependencies.
2. Rules, skills and docs are written per workspace (see [04-outputs.md](04-outputs.md#46-monorepos)). Backend workspaces do not load frontend rules.
3. Units that every workspace shares are written once, at the root.
4. Executable units are written at the root, because both agents read hooks, MCP servers and permissions there.

## 3.8 Project configuration

`tack.json` is committed. Every field is optional.

```json
{
  "$schema": "https://unpkg.com/@tenphi/tack/schema/tack.schema.json",
  "agents": ["claude", "codex"],
  "include": "all",
  "exclude": [],
  "replace": {},
  "trust": { "@cube-dev/ui-kit": true },
  "self": true
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `agents` | `["claude", "codex"]` | Which agents get outputs. |
| `include` | `"all"` | `"all"`, or a list of packages to take harness from. |
| `exclude` | `[]` | Packages or unit IDs to drop. |
| `replace` | `{}` | Unit ID → path of a project file that takes its place. |
| `trust` | `{}` | Which packages may run executable units. See [06-trust.md](06-trust.md). |
| `self` | `true` | Include the project's own `harness/`. |

## 3.9 CI

In CI (`CI=true`, or `--no-local`), Tack ignores layers 1 and 4. `tack sync --check` then fails when a committed output differs from what it would write.
