---
description: Turn on opt-in events about how agents and people use your harness, send them to your own handler, and let people opt out.
---

# Telemetry

**In short**

- Telemetry is off. A team turns it on in `harnesspm.json` with a handler: a command or a file. harnesspm has no vendor code and sends nothing anywhere else.
- Events never hold arguments, file contents or prompts. Sending never slows down or fails a command.
- A person opts out with `DO_NOT_TRACK=1`, or with `"telemetry": false` in `harnesspm.local.json`.

## Turn it on

```json
{
  "telemetry": {
    "events": "all",
    "send": { "file": ".harnesspm/events.jsonl" }
  }
}
```

Then run `npx -y @harnesspm/cli sync`. A file handler appends one JSON line per event. A command handler, such as `"node scripts/harness-events.mjs"`, gets each event as JSON on stdin. It runs from the project root, in a detached process, for at most 10 seconds.

The handler gets events only after a person's `sync` has recorded it in `harnesspm.lock.json`. An agent that adds or changes a handler cannot turn it on. Review a new handler in the lock diff, like a new hook.

## Events

| Type | When |
| --- | --- |
| `run` | `harnesspm run` finishes a script, also when a hook runs it |
| `mcp` | `harnesspm mcp` starts an MCP server |
| `sync` | `harnesspm sync` writes the outputs. It lists added, removed and changed units. A sync in CI sends none. |
| `why` | `harnesspm why` finds a unit |
| `help` | `harnesspm help <target>` prints a package, a rule or a tool |
| `read` | The agent reads a file of a unit, or loads a file-scoped rule or a workspace's rules by itself. Claude Code only. |
| `skill` | The agent loads a skill. Claude Code only. |
| `session` | A session starts or resumes |

A `run` event's `outcome` is `ok` for exit `0`, `answer` for an exit code that the script lists in its `answers`, and `failed` otherwise. A lint that exits `1` for "found problems" lists `"answers": [1]` next to its `usage`, so its findings do not count as failures. Count errors from `outcome` `failed`, not from a non-zero `exit`.

`run`, `help` and `why` events carry `outside: true` when an agent runs them from another folder with `-C`. Leave them out when you look for sessions whose hooks are missing.

`read`, `skill` and `session` come from harnesspm's own asynchronous hooks, so the agent never waits for them. Every event names units by their IDs, and the repository by its `origin` remote, such as `github.com/acme/app`. Events cover only the dependency and project layers. Units of added harnesses belong to a person and never reach the team's handler. [Events](https://github.com/tenphi/harnesspm/blob/main/docs/spec/14-telemetry.md#142-events) lists every field, with an example.

## Send events somewhere

A handler is your own code. To post each event to a service:

```js
// scripts/harness-events.mjs
let input = '';
for await (const chunk of process.stdin) input += chunk;
await fetch(process.env.HARNESS_EVENTS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: input });
```

For many events, prefer a file and ship it on a schedule. An OpenTelemetry Collector can tail the file with its filelog receiver, so no code runs in harnesspm.

## Report your own tools

A tool of your project that is not a harnesspm script, such as `yarn probe`, can send its runs to the same handler:

```js
import { reportRun } from '@harnesspm/cli/telemetry';

reportRun({ unit: 'app:scripts/probe', fields: { mode: 'fast' }, duration: 812, exit: 0 });

// A lint that exits 1 when it finds problems: the event's outcome is "answer", not "failed".
reportRun({ unit: 'app:scripts/lint', duration: 1430, exit: 1, answers: [1] });
```

It follows the same switch, opt-outs and trust rule as `harnesspm run`, and never throws, prints or waits. Keep arguments, file contents and paths out of `fields`. [Events from a project's own tools](https://github.com/tenphi/harnesspm/blob/main/docs/spec/14-telemetry.md#149-events-from-a-projects-own-tools) has every field.

## Opt out

| Where | How |
| --- | --- |
| Environment | `DO_NOT_TRACK=1` |
| One repository | `"telemetry": false` in `harnesspm.local.json`, which is never committed |
| Every repository on the machine | `"telemetry": false` in `~/.harnesspm/config.json` |

`npx -y @harnesspm/cli status` shows whether events are sent, held or off on this machine.

## Let agents report harness problems

Reporting is a rule of your own, not a harnesspm feature. Add one with `npx -y @harnesspm/cli new rule reporting-harness-problems` and say where agents should report:

```markdown
# Reporting harness problems

- When a harness rule, doc, skill or tool is wrong, missing or fails, file a ticket in <your tracker>.
- Say what you tried, what happened and what you expected. Add the output of `npx -y @harnesspm/cli why <ID>`.
- Then go on with the task. Do not change the unit unless the user asks.
```

## More

- [Telemetry](https://github.com/tenphi/harnesspm/blob/main/docs/spec/14-telemetry.md) in the specification: every field, and the trust rules for handlers.
