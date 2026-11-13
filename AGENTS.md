# AGENTS.md

Instructions for agents and people who work on this repository.

## What this repository is

The specification of **harnesspm**, the harness package manager, and its proof of concept. The spec lives in `docs/spec/`, background research in `docs/research/`, the code in `src/` and its tests in `test/`.

## Developing

- Node.js 22.18 or later runs the TypeScript in `src/` directly. `npm run build` writes `dist/` for publishing.
- Before saving a change, run `npm run typecheck`, `npm test` and `npm run check` (validates `harness/` and checks the committed outputs).
- After changing `harness/`, `harnesspm.json` or `docs/spec/` (the harness's docs), run `npm run sync` and commit `AGENTS.md` and `harnesspm.lock.json` with the change.
- The code follows the spec. When the code shows the spec is wrong, change the spec in the same change, and record what was observed in `docs/research/`.

## Writing rules

- **Simple and clear.** Short sentences. One idea per sentence. Lists and tables over long paragraphs.
- **Start every chapter with "In short":** two to four points that let a person or an agent act without reading further.
- **One term per concept.** Use the terms in `docs/spec/01-overview.md` §1.5. Add a term there before using a new one.
- **Do not hard-wrap prose.** One paragraph is one line.
- **Strict words only where strict.** Use MUST, SHOULD and MAY (RFC 2119) only for real requirements.
- **Every feature serves a scenario** in `docs/spec/01-overview.md` §1.6, or adds one.

## Proportional complexity

The size and strictness of each part must match how important, how hard and how widely used it is.

- Common paths (share a rule, use a package, add a personal harness) stay short and need no configuration.
- Hard parts that only implementers see (outputs per agent) may be long, but stay out of the way of authors and users.
- Prefer one general mechanism to several special cases. Prefer an existing convention to a new setting.
- When you remove an option that may come back, record it in `docs/spec/13-open-questions.md` §13.12.

## Facts about agents

- Every statement about how Claude Code, Codex or another agent behaves needs a source link.
- Mark each one in `docs/research/agent-capabilities.md`: ✅ documented, 🔍 observed, ❓ not confirmed.
- Re-check a fact against the vendor's docs before building on it. Agents change often.

## Standards first

Before adding a format, check `docs/spec/11-standards.md`. Reuse a standard when it fits. When harnesspm goes beyond one, say so there.

## Dogfooding

This repository uses and publishes its own harness (`docs/spec/12-dogfooding.md`). A change to any format in the spec MUST update `harnesspm.json` and `harness/` in the same change.

## Privacy

Do not put internal ticket IDs, private repository details, credentials or personal data into the spec. Examples use public packages.

## Saving changes

- Use Conventional Commits, for example `docs(spec): add hooks contract`.
- Work on a branch and open a pull request that says what changed and why. Do not push to `main`.
- For every change that users notice, add a changeset with `npx changeset`: pick `patch`, `minor` or `major` and write one line for users. Commit it with the change. Changes to CI, tests or this file need none.
- Do not edit `CHANGELOG.md` or `version` in `package.json` by hand. The release flow writes them.

## Releasing

Releases run in GitHub Actions (`.github/workflows/release.yml`) through [Changesets](https://github.com/changesets/changesets) and npm trusted publishing. No npm token is stored.

1. **Snapshots.** Every push to a pull request publishes `0.0.0-snapshot.<short sha>` under the dist-tag `pr_<number>`. A re-run adds the attempt number, such as `.2`, because npm never accepts a version twice. A comment on the pull request names the version. Try it with `npx @tenphi/harnesspm@<version>`.
2. **Version PR.** A merge to `main` that brings changesets opens or updates the "chore: version packages" pull request. It sets `version` in `package.json` and `package-lock.json`, runs `npm run sync` so `harnesspm.lock.json` records the new version of this repository's own harness, and writes the changesets into `CHANGELOG.md`.
3. **Publish.** Merging the version PR publishes the version to npm, tags it `v<version>` and creates its GitHub Release. npm adds provenance by itself while the repository is public. `prepack` builds `dist/` and runs `harnesspm check` first, so an invalid harness cannot ship.

CI (`.github/workflows/ci.yml`) runs on every pull request: typecheck, tests, `npm run check` and the docs site build on Node 24, and the built CLI on Node 20, the oldest version in `engines`.

## Docs site

The site at https://harnesspm.tenphi.me is built with [Cookbook](https://github.com/tenphi/cookbook), an Astro integration. It needs Node.js 22.19 or later.

- `npm run docs` serves it locally. `npm run build:docs` builds it into `site-dist/`, because `npm run build` writes the CLI to `dist/`. `npm run docs:doctor` and `npm run docs:check` check the sources and the built site, links included.
- `docs.config.ts` lists the pages and the navigation. `astro.config.ts` sets the site URL and the output folder.
- The home page is `docs-site/index.mdx`. Its components are in `docs-site/components/`, styled with Tasty through `@tenphi/cookbook/styling`, never with CSS. Its real examples are in `docs-site/examples/`.
- Getting started, the guides and the reference live in `docs/guide/`. They are not in the npm package. Keep them short and link to the spec for detail.
- `docs/spec/` is also the docs index of this repository's harness, which every user's agents read. The site shows each chapter as it is, at `/spec/<name>` (`01-overview.md` → `/spec/overview`). So a spec edit changes both: keep spec files plain Markdown, without site-only frontmatter or MDX. Link between chapters with relative paths, such as `06-trust.md#62-trusting-a-package`.
- `docs/research/` is on the site too, under `/research/`.
- `.github/workflows/deploy-docs.yml` deploys every push to `main` to GitHub Pages. In the repository's Settings → Pages, the source is "GitHub Actions" and the custom domain is `harnesspm.tenphi.me`, with a DNS CNAME record to `tenphi.github.io`. An Actions deployment ignores a `CNAME` file, so the repository has none.
- Examples on the site are real output. Run the commands in a scratch project to get them, and never hardcode the harnesspm version: the header shows it from `package.json`.

<!-- BEGIN:harnesspm — generated by `harnesspm sync`. Do not edit. To change a rule, run `npx harnesspm why <ID>`. -->
## @tenphi/harnesspm (this project)

### Files generated by harnesspm (harnesspm:rules/generated-files)

- Files and links that harnesspm writes, such as `.claude/agents/`, `.codex/agents/`, `.claude/skills/` and `.agents/skills/`, are outputs like the managed block. Never edit them. Change the source that `npx harnesspm why <ID>` names, with the `harnesspm-improve` skill.
- After changing `harnesspm.json` or a harness file, or after `npm install <pkg>` or `pnpm add`, run `npx harnesspm sync`.

- When editing `harnesspm.json`, `harnesspm.local.json`, `harness/**`, read harness/dev.harnesspm/rules/harnesspm-config.md — How to change harnesspm configuration and harness files safely (harnesspm:rules/harnesspm-config)
- Docs: node_modules/.harnesspm/docs/harnesspm/llms.txt (harnesspm:docs)
<!-- END:harnesspm -->
