# 11. Dogfooding

Tack is its own first user. This repository consumes its own harness and publishes it with the npm package.

## 11.1 What this repository has

| File | Role | Layer |
| --- | --- | --- |
| [`AGENTS.md`](../../AGENTS.md) | Contributor instructions for this repository | hand-written, plus a Tack block once the CLI exists |
| [`CLAUDE.md`](../../CLAUDE.md) | Imports `AGENTS.md` for Claude Code | hand-written |
| [`tack.json`](../../tack.json) | This repository's consumer configuration | 3, project |
| [`harness/`](../../harness/) | The harness that ships to everyone who installs `@tenphi/tack` | 3 here, 2 for consumers |

Until the CLI exists, these files are drafts that show the format. The first implementation MUST make them work as written, or change them and this chapter together.

## 11.2 What Tack's own harness gives its users

Every project that installs `@tenphi/tack` gets these units through the normal dependency layer:

| Unit | Kind | Purpose |
| --- | --- | --- |
| `tack:rules/generated-files` | Always-on rule | Generated files and blocks are outputs. Edit the source they name, then run `npx tack sync`. |
| `tack:rules/tack-config` | File-scoped rule (`tack.json`, `tack.local.json`, `harness/**`) | How to change Tack configuration and harness files safely. |
| `tack-author` | Skill | Create or change a harness: unit kinds, IDs, validation, publishing. |
| `tack-personal` | Skill | Add, edit, save and push a personal harness. Choose global or per-project. |
| `tack:scripts/check` | Script with `allow: true` | Lets agents validate their harness changes with `npx tack run tack:check` without a prompt. |
| Docs index | Docs | Points at this specification in the installed version of the package. |

This is also the reference example for package authors: it uses each unit kind once, at the smallest useful size.

## 11.3 Publishing

When the package exists, its `package.json` MUST include:

```json
{
  "name": "@tenphi/tack",
  "files": ["dist", "schema", "harness", "docs/spec"],
  "scripts": {
    "prepack": "tack pack-check"
  }
}
```

`tack pack-check` runs against the package itself, so a broken harness cannot be published.

## 11.4 Checks in this repository

| Check | When |
| --- | --- |
| `tack pack-check` | Every pull request and `prepack` |
| `tack sync --check --no-local` | Every pull request |
| Tests that run `tack sync` on fixture projects for Claude Code and Codex | Every pull request |

## 11.5 Changes to the spec

A change to a format in this specification MUST update this repository's own `tack.json` and `harness/` in the same change, so the example and the spec cannot drift apart.
