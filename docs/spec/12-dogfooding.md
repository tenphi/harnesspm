# 12. Dogfooding

**In short**

- This repository consumes its own harness and publishes it with the npm package.
- Every project that installs harnesspm gets three skills that match the three flows: `harnesspm-export`, `harnesspm-import` and `harnesspm-improve`.
- A format change in the spec MUST update these files in the same change.

## 12.1 What this repository has

| File | Role |
| --- | --- |
| [`AGENTS.md`](../../AGENTS.md) | How to work on this repository, including how to save changes. A harnesspm block is added once the CLI exists. |
| [`CLAUDE.md`](../../CLAUDE.md) | Imports `AGENTS.md` for Claude Code. |
| [`harnesspm.json`](../../harnesspm.json) | This repository's project configuration. |
| [`harness/`](../../harness/) | The harness that ships to everyone who installs `harnesspm`. Part of the project layer here, the dependency layer for users. |

Until the CLI exists, these files are drafts that show the format. The first implementation MUST make them work as written, or change them and this chapter together.

## 12.2 What harnesspm's harness gives its users

| Unit | Kind | Purpose |
| --- | --- | --- |
| `harnesspm:rules/generated-files` | Always-on rule | Outputs are generated. To change one, find its source with `harnesspm why`. |
| `harnesspm:rules/harnesspm-config` | File-scoped rule | How to change `harnesspm.json`, `harnesspm.local.json` and harness files safely. |
| `harnesspm-export` | Skill | Share a harness from a package: units, IDs, `extends`, checks, publishing. |
| `harnesspm-import` | Skill | Set up harnesspm in a project, trust packages, add a personal harness. |
| `harnesspm-improve` | Skill | Change any harness: find the owner, edit the source, save under the owner's rules. |
| `harnesspm:scripts/check` | Script, `allow: true` | Validate harness changes without a prompt: `npx harnesspm run harnesspm:check`. |
| Docs index | Docs | This specification, at the installed version. |

It is also a small reference example for package authors.

## 12.3 Publishing

```json
{
  "name": "harnesspm",
  "files": ["dist", "schema", "harness", "docs/spec"],
  "scripts": { "prepack": "harnesspm check" }
}
```

`harnesspm check` runs against the package itself, so a broken harness cannot be published.

## 12.4 Checks

| Check | When |
| --- | --- |
| `harnesspm check` | Every pull request and `prepack` |
| `harnesspm sync --check --no-local` | Every pull request |
| `harnesspm sync` on fixture projects, checked for Claude Code and Codex outputs | Every pull request |
