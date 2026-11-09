# 12. Open questions

These points are not decided. Each one lists the options and what would settle it.

## 12.1 Memory

v1 does not define memory. The word means different things, and each meaning needs a different design.

| Meaning | Who writes it | Who reads it | Scope | Exists today |
| --- | --- | --- | --- | --- |
| A. Notes an agent saves by itself while working | The agent | The same agent, later | One person, one project | Claude Code auto memory (`~/.claude/projects/<project>/memory/`, `autoMemoryDirectory`); Codex memories (`features.memories`, global under `$CODEX_HOME/memories/`) |
| B. Personal instructions and preferences | The person, sometimes the agent | Every session | One person, one or all projects | `CLAUDE.local.md`, `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`. Covered by personal rules in v1. |
| C. Hand-off notes for unfinished work | The agent | The next session | One task | Plans and progress files, no standard |
| D. Facts about a codebase that a whole team learns | Agents and people | Everyone | One project, the team | Covered by the project's own `harness/` and its review process |

Questions to answer before designing a memory unit:

1. Which of A–D does Tack need to move between projects or machines? B and D are already covered by rules and by editing and pushing back ([07-personal.md](07-personal.md#74-editing-and-pushing-back)).
2. For A: should Tack point the agents' own memory at a folder in the personal harness, so it syncs through git? Claude Code supports this with `autoMemoryDirectory`; Codex has no per-project memory folder setting.
3. How do memories from two machines merge? Memory files are written often, so git conflicts are likely.
4. What is private? Agent memory can contain things from a project the person would not put in a shared repository.
5. How big can it get? Claude Code loads only the first 200 lines or 25 KB of `MEMORY.md`.

**Next step:** use the personal harness with plain rules and notes during the proof of concept, record where that falls short, then decide.

## 12.2 Variables and slots

Two repositories often fork one rule only to change a few words, such as the name of a linter. Options:

- **Variables:** a rule uses `{{name}}`, and a consumer sets the value.
- **Slots:** a rule has a named section that a consumer fills with its own file.

Both add a concept. v1 has only `replace`. Decide after seeing how often a whole-file `replace` copies most of a rule.

## 12.3 Extension namespace

Agent Plugins requires a reverse-domain namespace based on a domain the client controls. The draft uses `io.github.tenphi.tack`. It is long, and it appears in every package as a folder name.

- **Option:** register a short domain and switch to its namespace before 1.0.
- **Decide:** before the first public release, because changing it later breaks every published harness.

## 12.4 Sub-agents for Codex

v1 writes sub-agents for Claude Code only. Find out whether Codex has a project-level format for custom agents that Tack can target.

## 12.5 Plugin output mode

Both agents have plugin systems. A generated plugin could put scripts on `PATH` and namespace skills. It is not used in v1 because Claude Code cloud sessions do not install repository-declared plugins (see [04-outputs.md](04-outputs.md#49-why-native-files-and-not-plugins)). Revisit when that changes, or as an option for local-only use.

## 12.6 CI without an install

A review bot that does not run an install sees no `node_modules`, so pointers into `node_modules/.tack/pkgs/` lead nowhere. Option: `tack fetch --frozen` downloads only the harness packages named in the lock. Decide after the proof of concept.

## 12.7 A team lock on rules

Should a team be able to mark a rule as one that personal layers cannot exclude? Nothing can enforce this on a developer's machine, and `tack status` already shows local changes. Current answer: no.

## 12.8 Cloud outputs not yet confirmed

Every ❓ in [08-cloud.md](08-cloud.md#86-where-personal-outputs-land-in-the-cloud) must be tested in the proof of concept.
