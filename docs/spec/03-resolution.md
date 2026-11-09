# 3. Resolution

**In short**

- Three layers, lowest to highest: **dependencies**, **project**, **personal**.
- A dependency passes on the harness of other packages only through `extends`.
- A higher layer wins on the same unit ID. It can `exclude` a unit below it, `replace` it, or `patch` some sections of a rule.

## 3.1 Layers

| Layer | Source | Committed outputs? |
| --- | --- | --- |
| 📦 **Dependencies** | Harness packages in the project's dependencies, and what they `extends` | yes |
| 🏢 **Project** | `harnesspm.json` and the project's own `harness/` | yes |
| 🙋 **Personal** | The person's harnesses (see [07-personal.md](07-personal.md)). Scope "everywhere" first, then scope "this project" | no |

Committed outputs MUST be computed from the dependency and project layers only. Two teammates with different personal harnesses produce identical committed files.

## 3.2 Discovery

For each workspace, harnesspm starts from its `dependencies`, `devDependencies` and `optionalDependencies`:

1. Resolve each one from the workspace folder, the way Node.js does.
2. Keep it if it has a `harness/` folder (or a package-root `skills/` folder).
3. Follow `extends` of every kept package (see [3.3](#33-extends)).

harnesspm reads files only. It never runs code from a dependency during discovery. Every dependency with a harness is included unless the project excludes it.

## 3.3 Extends

`extends` lets a package pass on the harness of packages it builds on.

```json
"extends": ["@tenphi/tasty", "@tenphi/glaze"]
```

1. Each name MUST be resolved **from the folder of the package that declares it**, so the version is the one that package uses.
2. harnesspm follows `extends` recursively and stops with an error on a cycle.
3. Only `extends` passes harness on. A library's other dependencies, including its development tools, never reach its users.
4. A package's `exclude`, `replace` and `patch` change what it passes on. A middle package can fix an upstream rule for all its users.

Example: an app depends only on `@cube-dev/ui-kit`, which extends Tasty and Glaze. The app gets all three, in the versions UI Kit installed.

## 3.4 Priority

Packages in the dependency layer are ordered **upstream first**: a package comes after the packages it extends. Unrelated packages are ordered by name.

| Situation | Result |
| --- | --- |
| Two units have the same ID | The later one wins (higher layer, or downstream package). |
| `exclude` names a unit or a package | It is dropped, with everything only it extends. |
| `replace` names a unit | The new file takes the unit's ID and place. |
| `patch` names a rule | Its sections change as defined in [02-package-format.md](02-package-format.md#25-rules). |
| Two skills have the same name | The later one wins, with a warning. |
| An override names a unit that does not exist | Warning. It usually means an upstream unit was renamed. |

For one rule, harnesspm takes the original or the highest `replace`, then applies every patch from the layers above it, lowest layer first. A patch from a layer below the winning `replace` is dropped with a warning.

When an upgrade changes a section that a patch replaces or removes, `harnesspm sync` warns and names the section, because the patch may now be out of date. The lock stores a hash of each such section to detect this.

## 3.5 One package, several versions

1. A workspace's direct dependency wins.
2. Otherwise the copy closest to the workspace in the `extends` chain wins.
3. harnesspm warns and names both versions.

## 3.6 Monorepos

1. Each workspace is resolved on its own dependencies. Backend workspaces do not get frontend rules.
2. Units that every workspace shares are written once, at the root.
3. Executable units are written at the root, where both agents read them.

## 3.7 Project configuration

`harnesspm.json` is committed. Every field is optional.

```json
{
  "agents": ["claude", "codex"],
  "exclude": ["@tenphi/glaze"],
  "patch": { "tasty:rules/lint-comments": "./agents/lint-comments.patch.md" },
  "trust": { "@cube-dev/ui-kit": true }
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `agents` | `["claude", "codex"]` | Which agents get outputs. |
| `exclude` | `[]` | Packages or unit IDs to drop. |
| `replace` | `{}` | Unit ID → path of a project file that takes its place. |
| `patch` | `{}` | Rule ID → path of a project patch that changes some of its sections. |
| `trust` | `{}` | Which packages may run executable units. See [06-trust.md](06-trust.md). |

The project's own `harness/`, if it has one, is always part of the project layer, so contributors see what users see.

## 3.8 CI

With `CI=true` or `--no-local`, harnesspm ignores the personal layer. `harnesspm sync --check` then fails when a committed output differs from what harnesspm would write.
