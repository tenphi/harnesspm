# 14. Telemetry

**In short**

- Telemetry is off. A team turns it on in `harnesspm.json` with `telemetry`: which events to send, and a handler that gets them, either a command or a file. harnesspm has no vendor code.
- harnesspm sends what it sees: script runs, MCP server starts, `sync`, `why` and `help <target>`. With agent events on, its own hooks also report when Claude Code reads a harness file, loads a workspace's rules or a skill, and when a session starts.
- A project's own tools send `run` events through the same handler with `reportRun` from `@tenphi/harnesspm/telemetry` ([14.9](#149-events-from-a-projects-own-tools)).
- A `run` event's `outcome` tells a tool's answer, such as a lint's "found problems", from a failure. Events from a folder outside the project, such as with `-C`, carry `outside: true`.
- Events never hold arguments, file contents or prompts. Sending never slows down or fails a command.
- A handler gets events only as a person's `sync` recorded it in the lock. A person opts out with `DO_NOT_TRACK=1` or `"telemetry": false` in `harnesspm.local.json`.

## 14.1 Turning it on

```json
{
  "telemetry": {
    "events": "all",
    "send": { "file": ".harnesspm/events.jsonl" }
  }
}
```

Then run `npx harnesspm sync`.

| Field | Default | Meaning |
| --- | --- | --- |
| `events` | `"all"` | The event types to send ([14.2](#142-events)), or `"all"`. |
| `send` | required | The **handler**. A command, such as `"node scripts/harness-events.mjs"`, gets each event as JSON on stdin. `{ "file": "<path>" }` appends each event as one line of JSON ([JSON Lines](https://jsonlines.org/)). Paths are relative to the project root. |

harnesspm adds a handler file inside the project to `.git/info/exclude` when it creates it.

## 14.2 Events

| Type | When | Fields beyond the common ones |
| --- | --- | --- |
| `run` | `harnesspm run` finishes a script. A hook's script is a `run` with caller `hook`. | `unit`, `package`, `version`, `exit`, `outcome`, `duration` (ms) |
| `mcp` | `harnesspm mcp` starts an MCP server. | `unit`, `package`, `version` |
| `sync` | `harnesspm sync` writes the outputs. `--check` and runs with `CI=true` send nothing: every CI job runs an install, and so a sync. | `packages` (name and version), `added`, `removed` and `changed` (unit IDs since the last lock), `pending` (packages whose executable units wait for trust), and when the agent's model held entries back ([6.2](06-trust.md#62-trusting-a-package), rule 4): `held` (the entries, as `sync` prints them) and `why` (what differs from the reviewed state) |
| `why` | `harnesspm why` finds a unit. | `unit`, `package`, `version` |
| `help` | `harnesspm help <target>` prints a package, a rule or a tool ([10.1](10-cli.md#help-for-a-package-a-rule-or-a-tool)). It shows whether agents follow the managed block's pointers, now that the block names rules instead of holding their text. | `package`, `version`; `unit` for a rule or a tool, missing for a whole package |
| `read` | Agent event: the agent reads a file of a unit, or loads a file-scoped rule or a workspace's managed block by itself. A block sends one event for each always-on rule it names: the agent saw the rule's line, not its text, which `help` prints. | `unit`, `package`, `version`, `via` (`tool` or `auto`), `page` for docs (the path inside the docs folder) |
| `skill` | Agent event: the agent loads a skill. | `unit`, `package`, `version` |
| `session` | Agent event: a session starts or resumes. | `source` (`startup`, `resume`, `clear`, `compact`, `fork`) |

A `run` event's `outcome` says what its `exit` means for that tool:

| `outcome` | When |
| --- | --- |
| `ok` | Exit `0`. |
| `answer` | The exit code is one of the script's **answers** ([5.1](05-executables.md#51-scripts)): the tool did its job and its answer is "no", such as a lint that found problems, a check that failed or a hook that blocks the agent. |
| `failed` | Any other exit code, and every run that a signal ended, whatever its answers. Such a run has `exit` `1`. |

A run without an exit code has no `outcome`. A script without `answers` reports every non-zero exit as `failed`.

Every event has these fields:

| Field | Meaning |
| --- | --- |
| `schema` | `harnesspm.event/1`. The number changes when a field changes meaning or goes away. A new field, such as `outcome` or `outside`, keeps it. |
| `type` | One of the types above. |
| `time` | ISO 8601, UTC. |
| `project` | The `name` in the root `package.json`. |
| `repository` | The repository's `origin` remote as `<host>/<path>`, such as `github.com/acme/app`, when it has one. It names the repository also where `project` is a placeholder, as the root of a monorepo often is. |
| `workspace` | The workspace folder from the root, or `.` for the root. |
| `harnesspm` | The harnesspm version. |
| `caller` | `person`; `agent` when the agent's model ran it ([6.2](06-trust.md#62-trusting-a-package), rule 4); `hook` when the agent ran it through a hook or an MCP server; `ci` when `CI=true`. |
| `agent` | `claude` or `codex`, when known. |
| `session` | The agent's session ID, when known. For Claude Code it is `CLAUDE_CODE_SESSION_ID` as its commands see it, so a hook's event and a command's event agree; a hook falls back to the payload's `session_id` ([14.4](#144-agent-events)). |
| `outside` | `true` when harnesspm runs from a folder outside the project, such as through `-C` ([10.1](10-cli.md#-c-dir)). Missing inside the project. Its `workspace` is `.`. `run`, `help` and `why` set it: the commands that `-C` serves. Agent events set it when the hook's `cwd` is outside the project, as in a session that started in a parent folder ([4.10](04-outputs.md#410-sessions-that-start-in-a-parent-folder)). It lets a handler tell an agent that works from another repository from a session inside the project whose hooks are missing. |
| `worktree` | `true` when the event comes from a folder in a [worktree](01-overview.md#15-terms): the caller's folder, or the hook's `cwd` for agent events. Missing otherwise, also in a submodule. A desktop app session in a worktree runs the main checkout's hooks ([Claude Code docs](https://code.claude.com/docs/en/worktrees#what-worktrees-share-with-the-main-checkout)), so its events show where the work happens and where the hooks come from. harnesspm reads the `.git` file and never runs git for it. |

```json
{"schema":"harnesspm.event/1","type":"run","time":"2026-11-13T10:00:00.000Z","project":"app","repository":"github.com/acme/app","workspace":".","harnesspm":"0.2.0","caller":"agent","agent":"claude","session":"77c89d39-1164-4bc0-b046-7a3e9bc97863","unit":"uikit:scripts/probe","package":"@cube-dev/ui-kit","version":"0.206.1","exit":0,"outcome":"ok","duration":812}
```

Rules:

1. An event MUST NOT hold script arguments, file contents, prompts, tool output or absolute paths. This covers the fields that a project's own tool adds ([14.9](#149-events-from-a-projects-own-tools)).
2. Events cover the dependency and project layers only. Units of added harnesses belong to a person, so they never reach the team's handler.
3. Units are named by their IDs ([2.8](02-package-format.md#28-unit-ids)). A file that is not part of a unit sends nothing.

## 14.3 Sending

- **File handler:** harnesspm appends one line.
- **Command handler:** harnesspm starts a detached process and returns at once. That process runs the command from the project root, with the event as JSON on stdin and the same environment, for at most 10 seconds. Each event starts the command once. The events of one hook run share one detached process, which runs the command for each in turn. For many events, prefer a file and ship it on a schedule.
- Telemetry MUST NOT change the result or the exit code of a command, and MUST NOT make it wait. harnesspm notes failures in `node_modules/.harnesspm/telemetry.log` on that machine and prints nothing.
- harnesspm does not retry or sample, and a command gets one event at a time. A handler can batch.

## 14.4 Agent events

`read`, `skill` and `session` come from harnesspm's own hooks. A sync by a person writes them when `events` includes one of these types, the handler is recorded in the lock, and the machine has not opted out. They are hooks, so a model run never adds them ([6.2](06-trust.md#62-trusting-a-package), rule 4).

| Agent | Hooks harnesspm writes | What harnesspm reads from the hook's JSON |
| --- | --- | --- |
| Claude Code | `PostToolUse` with the matcher `Read\|Skill`, `InstructionsLoaded` with the matcher `path_glob_match\|nested_traversal\|include`, `SessionStart`. All are `"async": true`. | `tool_input.file_path` of `Read`; `tool_input.skill` of `Skill`; `file_path` of a file-scoped rule that Claude Code loads through its `.claude/rules/` link, or of a workspace's `AGENTS.md`; `source`; `cwd`; `session_id`, when `CLAUDE_CODE_SESSION_ID` is not set |
| Codex | `SessionStart`, `"async": true` | `source` and `session_id` |

Codex reads files and skills through shell commands. harnesspm cannot map a shell command to a unit reliably, so Codex sends no `read` or `skill` events. Codex also runs a project hook only after a person reviews it in `/hooks` ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#codex)).

A hook MUST never make the agent wait. The hooks are asynchronous, and the command is fast:

1. It is `node <project>/node_modules/@tenphi/harnesspm/dist/cli.js track --agent <agent>`, an absolute path in a per-machine file, with the prefix of package hooks ([5.2](05-executables.md#52-hooks)). npx costs about 0.4 seconds per call. Without an installed harnesspm, or on Windows, harnesspm writes `npx harnesspm track …`.
2. `track` reads the hook's JSON from stdin. It maps the file path, or the skill name, to units with an index that `sync` writes to `node_modules/.harnesspm/telemetry.json`. The index lists the rule files, generated rules and docs indexes, and the skill and docs folders, of each package; each workspace's `AGENTS.md`, with the always-on rules its managed block names; and the repository, so a hook never asks git.
3. It hands the events off as in [14.3](#143-sending), and exits `0` at once without printing.

The session of an event is the one Claude Code's commands see in `CLAUDE_CODE_SESSION_ID`, which `run` events use. On a person's machine a hook's `session_id` can differ from it, which split one session into one with only hook events and one with only command events ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#settings-hooks-permissions)). Without the variable, the hook uses `session_id`. That hooks see the same variable as commands is not confirmed yet ([13.11](13-open-questions.md#1311-agent-behavior-not-confirmed-yet)). Either way nothing is lost: where a hook's variable equals its `session_id`, the event is as before; where it equals the commands', the split closes.

In a parent folder the command is `… -C <project> track --agent <agent>`. `-C` names the project, because the session's `cwd` is above it, and the events carry `outside: true` ([4.10](04-outputs.md#410-sessions-that-start-in-a-parent-folder)).

A workspace's block reaches Claude Code in two loads: its `CLAUDE.md` with `nested_traversal`, then the `AGENTS.md` it imports with `include` ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#settings-hooks-permissions)). The index lists only the `AGENTS.md`, so each rule is sent once per load, with `via: auto`. A `Read` of that file, which the root block's `## Workspaces` section asks for ([4.5](04-outputs.md#45-monorepos)), sends nothing for the block: Claude Code loads the folder's `CLAUDE.md` when the agent opens a file there, and that load sends the rules. So each rule counts once.

Not seen: reads through other tools, such as `cat` in a shell or a search, and the rules in the root block, which the agent gets in every session.

## 14.5 Trust

A command handler runs on every machine of the team. It follows the trust model of hooks ([6.2](06-trust.md#62-trusting-a-package), rule 4):

1. A sync by a person records the handler in `harnesspm.lock.json`, as `"telemetry": { "send": … }`.
2. harnesspm sends events only when `send` in `harnesspm.json` matches the lock. Otherwise the handler is **held**: nothing is sent, and `sync` and `status` say so.
3. A sync by the agent's model keeps the handler the lock has. A handler that an agent adds or changes stays held until a person runs `npx harnesspm sync` or `npx harnesspm approve`. Removing `telemetry` needs no person.
4. The lock diff shows a new or changed handler in review, like a new hook. `sync --check` fails while the lock and `harnesspm.json` differ.

The same rule covers file handlers, so there is one rule to learn.

## 14.6 Opting out

The team decides in `harnesspm.json`. A person can still opt out on their machine. Each of these stops every event, and the next sync removes the agent hooks:

| Where | How |
| --- | --- |
| Environment | `DO_NOT_TRACK=1`, the [Console Do Not Track](https://consoledonottrack.com/) convention |
| One repository | `"telemetry": false` in `harnesspm.local.json`, which is never committed |
| Every repository on the machine | `"telemetry": false` in `~/.harnesspm/config.json` |

`npx harnesspm status` shows whether events are sent, held or off on this machine.

## 14.7 Example handlers

A handler is the team's own code. Two common cases:

**Post each event to a service.**

```js
// scripts/harness-events.mjs
let input = '';
for await (const chunk of process.stdin) input += chunk;
await fetch(process.env.HARNESS_EVENTS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: input });
```

**Forward to OpenTelemetry.** Keep a file handler and let an OpenTelemetry Collector tail it with its [filelog receiver](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/filelogreceiver). No code runs in harnesspm:

```yaml
receivers:
  filelog:
    include: [/path/to/project/.harnesspm/events.jsonl]
    operators:
      - type: json_parser
```

A handler that maps `run` events to spans or error counts sets an error status only for `outcome` `failed`. An `answer` is the tool doing its job.

## 14.8 Reporting harness problems

Reporting is the project's own rule, not a harnesspm feature. A team that wants agents to report a wrong unit tells them where, in a rule of its own harness:

```markdown
# Reporting harness problems

- When a harness rule, doc, skill or tool is wrong, missing or fails, file a ticket in <tracker, such as the Linear team "Web" with the label `harness`>.
- Say what you tried, what happened and what you expected. Add the output of `npx harnesspm why <ID>`.
- Then go on with the task. Do not change the unit unless the user asks.
```

Add it with `npx harnesspm new rule reporting-harness-problems`, which writes `harness/dev.harnesspm/rules/reporting-harness-problems.md` in the project's own harness, paste the text, and run `npx harnesspm sync`. The agent files the ticket with its own tools, such as the tracker's MCP server. A tracker the agent cannot reach can be a file, such as `harness-reports.md`, that a person reads. An unattended run asks before it runs `npx harnesspm why`, so a team that runs agents that way allows `Bash(npx harnesspm why *)` in its Claude Code settings.

In a headless Claude Code run, such a rule led the agent to report a failing harness tool with the `why` output, without being asked ([research](https://github.com/tenphi/harnesspm/blob/main/docs/research/agent-capabilities.md#claude-code)).

## 14.9 Events from a project's own tools

A project often tells agents to use tools that are not harnesspm scripts, such as a `yarn probe` script or a file in `scripts/`. Moving each into the project's harness would change the command that every doc and agent uses. So the tool reports its runs itself:

```js
import { reportRun } from '@tenphi/harnesspm/telemetry';

reportRun({ unit: 'app:scripts/probe', fields: { mode: 'fast' }, duration: 812, exit: 1, answers: [1] });
```

| Field | Required | Meaning |
| --- | --- | --- |
| `unit` | yes | An ID in the form of [2.8](02-package-format.md#28-unit-ids), such as `app:scripts/probe`. The tool does not have to be a unit of the harness. |
| `fields` | no | The tool's own fields. Rule 1 of [14.2](#142-events) applies: no arguments, file contents, prompts, tool output or absolute paths. A field with the name of a common field, such as `outside`, or of `unit`, `package`, `version`, `exit`, `outcome` or `duration`, is left out. |
| `cwd` | no | Where the tool runs. The project is the nearest folder above it with `harnesspm.json`. Default: the current folder. |
| `duration` | no | Milliseconds. |
| `exit` | no | The tool's exit code. |
| `answers` | no | The exit codes that are answers, as a script's `answers` ([5.1](05-executables.md#51-scripts)). They set `outcome` ([14.2](#142-events)). |

`reportRun` sends a `run` event as `harnesspm run` does: the same handler, the same `events` switch, every opt-out ([14.6](#146-opting-out)), nothing while the handler is held ([14.5](#145-trust)), the same `caller`, `agent` and `session`, and `outside` when the current folder, not `cwd`, is outside the project. It names the unit's package and version when the index of [14.4](#144-agent-events) knows its plugin. It never throws, never prints and never waits: a command handler gets the event in a detached process, so a tool can call it right before `process.exit()`. Problems go into `telemetry.log`, as in [14.3](#143-sending).

The package's `exports` field has this entry, `./telemetry`, and `./package.json`. Other files of the package are internal.
