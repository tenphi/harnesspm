# 3. Resolution

**In short**

- Three layers, lowest to highest: **dependencies**, **project**, **personal**.
- A dependency passes on the harness of other packages only through `extends`.
- A higher layer changes units below it only through `exclude`, `replace` and `patch`. Unit IDs never clash between packages, because plugin names are unique.

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
2. Keep it if it has a `harness/` folder.
3. Follow `extends` of every kept package (see [3.3](#33-extends)).

harnesspm reads files only. It never runs code from a dependency during discovery. Every dependency with a harness is included unless the project excludes it.

## 3.3 Extends

`extends` lets a package pass on the harness of packages it builds on.

```json
"extends": ["@tenphi/tasty", "@tenphi/glaze"]
```

1. Each name MUST be resolved **from the folder of the package that declares it**, so the version is the one that package uses. When copies with different versions remain, [3.5](#35-one-package-several-versions) picks one.
2. harnesspm follows `extends` recursively and stops with an error on a cycle.
3. Only `extends` passes harness on. A library's other dependencies, including its development tools, never reach its users.
4. A package's `exclude`, `replace` and `patch` change what it passes on. A middle package can fix an upstream rule for all its users.

Example: an app depends only on `@cube-dev/ui-kit`, which extends Tasty and Glaze. The app gets all three, in the versions UI Kit installed.

## 3.4 Priority

Packages in the dependency layer are ordered **upstream first**: a package comes after the packages it extends. Unrelated packages are ordered by name.

| Situation | Result |
| --- | --- |
| A personal project entry repeats a unit ID of its own harness | The entry's unit wins. |
| `exclude` names a unit or a package | It is dropped, with everything only it extends. |
| `replace` names a unit | The new file takes the unit's ID and place. |
| `patch` names a rule | Its sections change as defined in [02-package-format.md](02-package-format.md#25-rules). |
| Two skills have the same name | The later one wins, with a warning. |
| An override names a unit that does not exist | Warning. It usually means an upstream unit was renamed. |

For one rule, harnesspm takes the original or the highest `replace`, then applies every patch from the layers above it, lowest layer first. A patch from a layer below the winning `replace` is dropped with a warning.

When an upgrade changes a section that a patch replaces or removes, `harnesspm sync` warns and names the section, because the patch may now be out of date. The lock stores a hash of each such section to detect this.

## 3.5 One package, several versions

Outputs point at one stable path per package ([04-outputs.md](04-outputs.md#42-stable-package-paths)), so harnesspm uses one version of each package in a repository:

1. A direct dependency of a workspace wins.
2. Otherwise the copy closest to a workspace in the `extends` chain wins.
3. Among equals, the highest version wins.

harnesspm warns and names the versions.

## 3.6 Monorepos

1. Each workspace is resolved on its own dependencies. Backend workspaces do not get frontend rules.
2. Units that every workspace shares are written once, at the root.
3. Executable units are written at the root, where both agents read them.

## 3.7 Project configuration

`harnesspm.json` is committed. Every field is optional.

```json
{
  "$schema": "https://unpkg.com/harnesspm/schema/harnesspm.schema.json",
  "exclude": ["@tenphi/glaze"],
  "patch": { "tasty:rules/lint-comments": "./agents/lint-comments.patch.md" },
  "trust": { "@cube-dev/ui-kit": true }
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `$schema` | — | The JSON schema, for editors. |
| `exclude` | `[]` | Packages or unit IDs to drop. |
| `replace` | `{}` | Unit ID → path of a project file that takes its place. |
| `patch` | `{}` | Rule ID → path of a project patch that changes some of its sections. |
| `trust` | `{}` | Which packages may run executable units. See [06-trust.md](06-trust.md). |

The project's own `harness/`, if it has one, resolves like any harness package: its `extends` bring packages into the dependency layer, and its `exclude`, `replace` and `patch` apply here as they do for its users. `harnesspm.json` applies after it, for this repository only. So contributors see what users see, plus the repository's own changes.

harnesspm writes outputs for both Claude Code and Codex. Outputs for an agent a person does not use cost nothing: they are per machine and excluded from git.
