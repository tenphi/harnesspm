# AGENTS.md

Instructions for agents and people who work on this repository.

## What this repository is

The specification of **Tack**, the harness package manager. There is no code yet. The spec lives in `docs/spec/`, background research in `docs/research/`.

## Writing rules

- **Simple and clear.** Short sentences. One idea per sentence. Lists and tables over long paragraphs.
- **One term per concept.** Use the terms from the glossary in `docs/spec/01-overview.md` §1.4. Add a term there before using a new one.
- **Do not hard-wrap prose.** One paragraph is one line.
- **Strict words only where strict.** Use MUST, SHOULD and MAY (RFC 2119) only for real requirements.
- **Every feature serves a scenario.** A new feature names the scenario in `docs/spec/01-overview.md` §1.5 it serves, or adds one.
- **Keep it small.** Prefer one general mechanism to several special cases. Write down rejected options in `docs/spec/12-open-questions.md` when they may come back.

## Facts about agents

- Every statement about how Claude Code, Codex or another agent behaves needs a source link.
- Mark each one in `docs/research/agent-capabilities.md`: ✅ documented, 🔍 observed, ❓ not confirmed.
- Agent features change often. Re-check a fact against the vendor's docs before building on it.

## Standards first

Before adding a format, check `docs/spec/10-standards.md`. Reuse a standard when it fits. When Tack goes beyond one, say so in that chapter.

## Dogfooding

This repository uses and publishes its own harness (`docs/spec/11-dogfooding.md`). A change to any format in the spec MUST update `tack.json` and `harness/` in the same change.

## Privacy

Do not put internal ticket IDs, private repository details, credentials or personal data into the spec. Examples use public packages.

## Commits

Use Conventional Commits, for example `docs(spec): add hooks contract`.
