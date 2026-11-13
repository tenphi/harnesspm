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

Then run `npx harnesspm sync`. A file handler appends one JSON line per event. A command handler, such as `"node scripts/harness-events.mjs"`, gets each event as JSON on stdin. It runs from the project root, in a detached process, for at most 10 seconds.

The handler gets events only after a person's `sync` has recorded it in `harnesspm.lock.json`. An agent that adds or changes a handler cannot turn it on. Review a new handler in the lock diff, like a new hook.

## Events

| Type | When |
| --- | --- |
| `run` | `harnesspm run` finishes a script, also when a hook runs it |
| `mcp` | `harnesspm mcp` starts an MCP server |
| `sync` | `harnesspm sync` writes the outputs. It lists added, removed and changed units. |
| `why` | `harnesspm why` finds a unit |
| `read` | The agent reads a file of a unit, or loads a file-scoped rule by itself. Claude Code only. |
| `skill` | The agent loads a skill. Claude Code only. |
| `session` | A session starts or resumes |

`read`, `skill` and `session` come from harnesspm's own asynchronous hooks, so the agent never waits for them. Every event names units by their IDs, and covers only the dependency and project layers. Units of added harnesses belong to a person and never reach the team's handler. [Events](../spec/14-telemetry.md#142-events) lists every field, with an example.

## Send events somewhere

A handler is your own code. To post each event to a service:

```js
// scripts/harness-events.mjs
let input = '';
for await (const chunk of process.stdin) input += chunk;
await fetch(process.env.HARNESS_EVENTS_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: input });
```

For many events, prefer a file and ship it on a schedule. An OpenTelemetry Collector can tail the file with its filelog receiver, so no code runs in harnesspm.

## Opt out

| Where | How |
| --- | --- |
| Environment | `DO_NOT_TRACK=1` |
| One repository | `"telemetry": false` in `harnesspm.local.json`, which is never committed |
| Every repository on the machine | `"telemetry": false` in `~/.harnesspm/config.json` |

`npx harnesspm status` shows whether events are sent, held or off on this machine.

## Let agents report harness problems

Reporting is a rule of your own, not a harnesspm feature. Add one with `npx harnesspm new rule reporting-harness-problems` and say where agents should report:

```markdown
# Reporting harness problems

- When a harness rule, doc, skill or tool is wrong, missing or fails, file a ticket in <your tracker>.
- Say what you tried, what happened and what you expected. Add the output of `npx harnesspm why <ID>`.
- Then go on with the task. Do not change the unit unless the user asks.
```

## More

- [Telemetry](../spec/14-telemetry.md): every field, and the trust rules for handlers.
