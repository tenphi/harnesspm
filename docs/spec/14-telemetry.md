# 14. Telemetry

**In short**

- Telemetry is off. A team turns it on in `harnesspm.json` with `telemetry`: which events to send, and a handler that gets them, either a command or a file. harnesspm has no vendor code.
- harnesspm sends what it sees: script runs, MCP server starts, `sync` and `why`. With agent events on, its own hooks also report when Claude Code reads a harness file or loads a skill, and when a session starts.
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
| `run` | `harnesspm run` finishes a script. A hook's script is a `run` with caller `hook`. | `unit`, `package`, `version`, `exit`, `duration` (ms) |
| `mcp` | `harnesspm mcp` starts an MCP server. | `unit`, `package`, `version` |
| `sync` | `harnesspm sync` writes the outputs. `--check` sends nothing. | `packages` (name and version), `added`, `removed` and `changed` (unit IDs since the last lock), `pending` (packages whose executable units wait for trust) |
| `why` | `harnesspm why` finds a unit. | `unit`, `package`, `version` |
| `read` | Agent event: the agent reads a file of a unit, or loads a file-scoped rule by itself. | `unit`, `package`, `version`, `via` (`tool` or `auto`), `page` for docs (the path inside the docs folder) |
| `skill` | Agent event: the agent loads a skill. | `unit`, `package`, `version` |
| `session` | Agent event: a session starts or resumes. | `source` (`startup`, `resume`, `clear`, `compact`, `fork`) |

Every event has these fields:

| Field | Meaning |
| --- | --- |
| `schema` | `harnesspm.event/1`. The number changes when a field changes meaning or goes away. |
| `type` | One of the types above. |
| `time` | ISO 8601, UTC. |
| `project` | The `name` in the root `package.json`. |
| `workspace` | The workspace folder from the root, or `.` for the root. |
| `harnesspm` | The harnesspm version. |
| `caller` | `person`; `agent` when the agent's model ran it ([6.2](06-trust.md#62-trusting-a-package), rule 4); `hook` when the agent ran it through a hook or an MCP server; `ci` when `CI=true`. |
| `agent` | `claude` or `codex`, when known. |
| `session` | The agent's session ID, when known. |

```json
{"schema":"harnesspm.event/1","type":"run","time":"2026-11-13T10:00:00.000Z","project":"app","workspace":".","harnesspm":"0.2.0","caller":"agent","agent":"claude","session":"77c89d39-1164-4bc0-b046-7a3e9bc97863","unit":"uikit:scripts/probe","package":"@cube-dev/ui-kit","version":"0.206.1","exit":0,"duration":812}
```

Rules:

1. An event MUST NOT hold script arguments, file contents, prompts, tool output or absolute paths.
2. Events cover the dependency and project layers only. Units of added harnesses belong to a person, so they never reach the team's handler.
3. Units are named by their IDs ([2.8](02-package-format.md#28-unit-ids)). A file that is not part of a unit sends nothing.

## 14.3 Sending

- **File handler:** harnesspm appends one line.
- **Command handler:** harnesspm starts a detached process and returns at once. That process runs the command from the project root, with the event as JSON on stdin and the same environment, for at most 10 seconds. Each event starts the command once. For many events, prefer a file and ship it on a schedule.
- Telemetry MUST NOT change the result or the exit code of a command, and MUST NOT make it wait. harnesspm notes failures in `node_modules/.harnesspm/telemetry.log` on that machine and prints nothing.
- harnesspm does not retry, batch or sample. A handler can.

## 14.4 Agent events

`read`, `skill` and `session` come from harnesspm's own hooks. A sync by a person writes them when `events` includes one of these types, the handler is recorded in the lock, and the machine has not opted out. They are hooks, so a model run never adds them ([6.2](06-trust.md#62-trusting-a-package), rule 4).

| Agent | Hooks harnesspm writes | What harnesspm reads from the hook's JSON |
| --- | --- | --- |
| Claude Code | `PostToolUse` with the matcher `Read\|Skill`, `InstructionsLoaded` with the matcher `path_glob_match`, `SessionStart`. All are `"async": true`. | `tool_input.file_path` of `Read`; `tool_input.skill` of `Skill`; `file_path` of a file-scoped rule that Claude Code loads through its `.claude/rules/` link; `source` and `session_id` |
| Codex | `SessionStart`, `"async": true` | `source` and `session_id` |

Codex reads files and skills through shell commands. harnesspm cannot map a shell command to a unit reliably, so Codex sends no `read` or `skill` events. Codex also runs a project hook only after a person reviews it in `/hooks` ([research](../research/agent-capabilities.md#codex)).

A hook MUST never make the agent wait. The hooks are asynchronous, and the command is fast:

1. It is `<project>/node_modules/.bin/harnesspm track --agent <agent>`, an absolute path in a per-machine file. npx costs about 0.4 seconds per call. Without a local binary, harnesspm writes `npx harnesspm track …`.
2. `track` reads the hook's JSON from stdin. It maps the file path, or the skill name, to a unit with an index that `sync` writes to `node_modules/.harnesspm/telemetry.json`. The index lists the rule files, generated rules and docs indexes, and the skill and docs folders, of each package.
3. It hands the event off as in [14.3](#143-sending), and exits `0` at once without printing.

Not seen: reads through other tools, such as `cat` in a shell or a search, and rules that the agent gets in its main instructions, such as always-on rules.

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

## 14.8 Reporting harness problems

Reporting is the project's own rule, not a harnesspm feature. A team that wants agents to report a wrong unit tells them where, in a rule of its own harness:

```markdown
# Reporting harness problems

- When a harness rule, doc, skill or tool is wrong, missing or fails, file a ticket in <tracker, such as the Linear team "Web" with the label `harness`>.
- Say what you tried, what happened and what you expected. Add the output of `npx harnesspm why <ID>`.
- Then go on with the task. Do not change the unit unless the user asks.
```

Add it with `npx harnesspm new rule reporting-harness-problems`, which writes `harness/dev.harnesspm/rules/reporting-harness-problems.md` in the project's own harness, paste the text, and run `npx harnesspm sync`. The agent files the ticket with its own tools, such as the tracker's MCP server. A tracker the agent cannot reach can be a file, such as `harness-reports.md`, that a person reads. An unattended run asks before it runs `npx harnesspm why`, so a team that runs agents that way allows `Bash(npx harnesspm why *)` in its Claude Code settings.

In a headless Claude Code run, such a rule led the agent to report a failing harness tool with the `why` output, without being asked ([research](../research/agent-capabilities.md#claude-code)).
