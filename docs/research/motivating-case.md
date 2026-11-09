# Motivating case

A real chain of packages, surveyed in November 2026. It shows the manual work Tack replaces.

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

## Tools

- UI Kit ships a probe library for agents to capture DOM and CSS. The command-line tool around it exists twice, once in UI Kit and once in an application, with hundreds of lines of difference.

## What Tack changes here

| Today | With Tack |
| --- | --- |
| Symlinks and pack-time copies | `extends`, resolved to the installed versions |
| Hand-written indexes | Generated indexes |
| Restated or contradicting rules | One source, with `replace` in the layer that differs |
| Forked policies and workflows | One harness-only package |
| Write-once scaffolding | Outputs rewritten on every install |
| A tool copied into each project | A script shipped once and run with `tack run` |
| Agent-specific copies | Native outputs generated for each agent |
