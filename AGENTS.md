# AGENTS.md

Instructions for agents and people who work on this repository.

## What this repository is

The specification of **Tack**, the harness package manager. There is no code yet. The spec lives in `docs/spec/`, background research in `docs/research/`.

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

Before adding a format, check `docs/spec/11-standards.md`. Reuse a standard when it fits. When Tack goes beyond one, say so there.

## Dogfooding

This repository uses and publishes its own harness (`docs/spec/12-dogfooding.md`). A change to any format in the spec MUST update `tack.json` and `harness/` in the same change.

## Privacy

Do not put internal ticket IDs, private repository details, credentials or personal data into the spec. Examples use public packages.

## Saving changes

- Use Conventional Commits, for example `docs(spec): add hooks contract`.
- **Until the first release:** commit on a branch, then fast-forward `main` and push. A pull request is not needed.
- **Once a release process exists:** work on a branch and open a pull request that says what changed and why. Do not push to `main`. Update this section when the release process is added.
