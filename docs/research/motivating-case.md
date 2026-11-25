# Motivating case

A real chain of packages, surveyed in November 2026. It shows the manual work harnesspm replaces.

```
@tenphi/tasty (styles) ─┐
@tenphi/glaze (colors) ─┼─▶ @cube-dev/ui-kit (design system) ─▶ applications
@tenphi/eslint-plugin-tasty ┘
@tenphi/tasty + @tenphi/glaze ─▶ @tenphi/cookbook (docs engine) ─▶ documentation sites
```

## What the packages ship today

| Package | Agent material in the npm package |
| --- | --- |
| Tasty | All of `docs/`, including `ai-agents.md`, a brief written for agents that use Tasty. |
| Glaze | `docs/` and its **contributor** `AGENTS.md` (structure, release process), which is noise for users. |
| eslint-plugin-tasty | Nothing. Rule doc links point at the `main` branch, and many rules have no page. |
| UI Kit | Component docs, plus copies of the Tasty and Glaze docs. Its own review rules and skills are not published. |
| Cookbook | Copies of upstream docs with a version manifest. Its scaffolder writes an `AGENTS.md` and a skill into new sites once. |

## Manual mechanisms

1. **Symlinks into `node_modules`.** UI Kit links `docs/tasty` and `docs/glaze` into `node_modules`. Before publishing, a script replaces the links with copies, and after publishing another script restores them. Applications link to UI Kit's docs the same way. Every link breaks when nothing is installed, for example in a review bot that does not install dependencies.
2. **Vendoring at pack time.** Cookbook copies upstream docs into its package and rewrites their links.
3. **Hand-written indexes.** An application keeps a hand-written list of UI Kit component pages. It fell behind the library and still linked a component that no longer exists.
4. **Restated rules.** Downstream instructions copy upstream rules "so they are not missed".
5. **Write-once scaffolding.** Files written when a site is created never receive updates.

## Drift

1. **One policy, three forks.** The same complexity policy exists in three repositories, each with local edits, and the skill that applies it has three different versions.
2. **One workflow, two forks.** A "submit changes" command for agents exists in two libraries. The copies disagree on which checks to run.
3. **Broken links after an upgrade.** A major version of Glaze renamed and removed doc pages that UI Kit's instructions link to. The links break as soon as UI Kit upgrades.
4. **Stale agent-specific copies.** A Cursor rule file restates `AGENTS.md` and lists a fraction of today's files. Another package's only agent file says it has 27 lint rules; it has about 46.

## Contradictions between layers

- Tasty's agent brief tells agents to silence a lint rule with an `eslint-disable` comment.
- An application that runs the rule through oxlint tells agents that only `oxlint-disable` works there.

Nothing connects the two, so an agent in that application gets both instructions.

## Docs sites

A docs site may render more of a package than its docs folder. tasty.style builds its docs with Cookbook from Tasty's repository and renders the README as its Introduction page, so a docs page's link to `../README.md` leads to that page on the site. A copy of the docs folder alone, such as the one harnesspm writes for search, cannot follow such a link. Changing it in the package to a GitHub URL would send the site's readers away from the site, so the copy points it at the installed package instead.

## Tools

- UI Kit ships a probe library for agents to capture DOM and CSS. The command-line tool around it exists twice, once in UI Kit and once in an application, with hundreds of lines of difference.

## Cookbook on harnesspm

Observed when Cookbook started to pass on Glaze's harness with harnesspm 0.9 (Nov 2026).

- **An upstream skill that does not fit.** Glaze's `glaze-theme` skill tells agents to search the code for `glaze(`, to inspect "the module that defines the theme", and to keep "the export the application already uses". In a Cookbook site, colors come from `theme.palette` in `docs.config.ts`, which Cookbook resolves with Glaze, so none of these exist there. The spec said `replace` takes any unit, but 0.9 applied it to rules only, and a skill of Cookbook's own with the same name warned on every sync. `replace` now takes a skill folder ([spec 3.4](../spec/03-resolution.md#34-priority)).
- **A docs folder that a build writes.** Cookbook's facade workspace points `docs` at a folder its build copies from the repository's `docs/`, and git ignores it. Before a build there was no docs unit; after one there was, so the lock and the workspaces' blocks depended on whether a build ran, and `sync --check` failed on one side. Such a folder is now no unit for `sync` ([spec 2.7](../spec/02-package-format.md#27-docs), rule 6).
- **A site below the git root.** Cookbook's guide creates a site in `docs-site/` inside the user's repository and runs `harnesspm init` there. 0.9 wrote the site's per-machine paths into `.git/info/exclude` as if `docs-site/` were the root, so git showed its links as untracked ([spec 4.1](../spec/04-outputs.md#41-principles)).

## What harnesspm changes here

| Today | With harnesspm |
| --- | --- |
| Symlinks and pack-time copies | `extends`, resolved to the installed versions |
| Hand-written indexes | Generated indexes |
| Restated or contradicting rules | One source, with `replace` in the layer that differs |
| Forked policies and workflows | One harness-only package |
| Write-once scaffolding | Outputs rewritten on every install |
| A tool copied into each project | A script shipped once and run with `harnesspm run` |
| Agent-specific copies | Native outputs generated for each agent |
