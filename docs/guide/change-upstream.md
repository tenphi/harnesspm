---
description: Patch, replace or exclude any unit from a dependency, find where a line came from with why, and let agents improve a harness the owner's way.
---

# Change upstream units

**In short**

- `npx harnesspm why <ID>` names a unit's owner and source, and says how to change it.
- In `harnesspm.json`, a `patch` changes a few sections of a rule, `replace` swaps a whole rule or skill, and `exclude` drops a unit or a package.
- An agent can make these changes. The harness's owner decides how a change is saved.

## Find the source

Every line in the managed block ends with a unit ID, such as `acme-colors:rules/usage`. Ask harnesspm about it:

```text
$ npx harnesspm why acme-colors:rules/usage
owner       dependency @acme/colors 2.1.0 (via @acme/ui)
source      node_modules/.harnesspm/pkgs/@acme/colors/harness/dev.harnesspm/rules/usage.md
patch       node_modules/@acme/ui/harness/dev.harnesspm/patches/acme-colors-usage.patch.md (from @acme/ui)
repository  https://github.com/acme/colors
editable    no. Add a `patch`, `replace` or `exclude` in harnesspm.json, or propose the change upstream.
```

This is the site's example app: it depends on `@acme/ui`, which passes on the harness of `@acme/colors` and already patches this rule. The packages are made up, and the output is real.

A unit ID is `<plugin name>:<kind>/<name>`. Every unit has one: `acme-colors:skills/acme-colors-theme`, `acme-colors:scripts/contrast`, `acme-colors:docs`. For a script, `why` also prints the command that runs it and whether its package is trusted.

## Patch a few sections of a rule

A patch replaces, adds or removes sections of a rule and keeps the rest. `new patch` writes one with a copy of the rule's sections and registers it:

```text
$ npx harnesspm new patch acme-colors:rules/usage
Wrote harnesspm/patches/acme-colors-usage.patch.md, registered in harnesspm.json.
Keep only the sections you change and edit them. Delete the others. To drop a section, list its heading in `remove:` frontmatter.
```

Keep the sections you change and delete the others:

```markdown
## Contrast

- Body text needs a contrast ratio of at least 7 against its background. This app targets WCAG AAA.
```

Run `npx harnesspm sync`. The block now has your section in place of the package's, and `why` lists your patch after the one from `@acme/ui`:

```text
patch       node_modules/@acme/ui/harness/dev.harnesspm/patches/acme-colors-usage.patch.md (from @acme/ui)
patch       harnesspm/patches/acme-colors-usage.patch.md (from harnesspm.json)
```

How sections match:

1. A section is a heading and everything up to the next heading of the same or a higher level.
2. A section in the patch replaces the section with the same heading text and level.
3. A section the rule does not have is added at the end. So is text before the patch's first heading.
4. `remove: ["Heading"]` in the patch's frontmatter removes that section.

When an upgrade changes a section that your patch replaces or removes, `sync` warns and names the section, because your patch may be out of date.

## Replace or exclude a unit

```json
{
  "replace": { "acme-styles:rules/usage": "./harnesspm/styles-usage.md", "acme-colors:skills/acme-colors-theme": "./harnesspm/acme-colors-theme" },
  "exclude": ["acme-styles:hooks/check-edit"]
}
```

- `replace` puts your file in a rule's place, or your folder in a skill's place. The unit keeps its ID. A skill's folder has its own `SKILL.md`, with the skill's `name`.
- Other units, such as tools and hooks, can't be replaced: exclude them and add your own.
- `exclude` drops a unit by ID, or a whole package by name, such as `"@acme/styles"`, with everything only it extends.
- An override that names a unit that does not exist gives a warning. It usually means the upstream unit was renamed.

Run `npx harnesspm sync` after each change, and commit `harnesspm.json`, your files, `AGENTS.md` and the lock.

## Who changes what

Changes come from three layers. Higher layers win:

| Layer | Where the change lives | Who sees it |
| --- | --- | --- |
| Dependencies | A library's `harness/plugin.json` changes the harness it passes on | Every project that installs the library |
| Project | `harnesspm.json` | Everyone who works on the repository |
| Added | An added harness's `plugin.json` | The person who added it |

For one rule, harnesspm takes the original or the highest `replace`, then applies every patch from the layers above it, lowest layer first. See [priority](https://github.com/tenphi/harnesspm/blob/main/docs/spec/03-resolution.md#34-priority).

An added harness cannot change committed text. When it patches or excludes a team always-on rule, harnesspm writes the change into your local instructions instead, which both agents read after the team block.

## Improve a harness with an agent

Every project that installs harnesspm gets the `harnesspm-improve` skill. Tell your agent that a rule is wrong, or ask it to remember something, and it follows these steps:

1. It runs `npx harnesspm why <ID>` to find the unit's owner.
2. It changes the source. A dependency's files in `node_modules` are read-only, so it adds a `patch`, `replace` or `exclude` to the project, or to your added harness, and can propose the change upstream.
3. Before saving, it reads the owner's `AGENTS.md` and `CONTRIBUTING.md` and follows them. "Commit and push to `main`" and "leave the change uncommitted" are both valid rules.
4. When the owner says nothing, it shows you the change and asks, then uses a branch named `harnesspm/<topic>` and a pull request. It never pushes to the default branch unless the owner's rules allow it.

harnesspm does not push or talk to git hosts. The agent uses its own tools, such as the GitHub CLI.

| Owner | Where the source is | How it changes |
| --- | --- | --- |
| Dependency | `node_modules`, read-only | A patch, replace or exclude here, or a proposal to the package's repository |
| Project | Your repository | Edit the file like any other change |
| Added harness | Its working copy or folder | Edit the file there. harnesspm gives the agent write access to it. |

## More

- [Improving a harness](https://github.com/tenphi/harnesspm/blob/main/docs/spec/08-improving.md) in the specification: the full flow.
- [Patches](https://github.com/tenphi/harnesspm/blob/main/docs/spec/02-package-format.md#patches) and [project configuration](https://github.com/tenphi/harnesspm/blob/main/docs/spec/03-resolution.md#37-project-configuration) in the specification.
