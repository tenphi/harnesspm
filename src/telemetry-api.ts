// The public telemetry entry, `@tenphi/harnesspm/telemetry` (spec 14.9): a project's own tools report their runs
// through the same handler, switch, opt-outs and trust rule as `harnesspm run`. Like `harnesspm track`, it loads
// only Node.js built-ins and light modules, so a tool can call it on every run.
import * as path from 'node:path';
import { commandCaller, configDir, note, outsideField, readIndex, readTelemetryState, runOutcome, sendEvent, type EventContext, type TelemetryIndex } from './telemetry.ts';
import { findWorkspaces } from './workspaces.ts';
import { isRecord, readJsonIfExists, relPosix } from './util.ts';

export interface RunReport {
  /** The tool's unit ID, such as `app:scripts/probe`: `<plugin name>:<path>`. */
  unit: string;
  /**
   * Fields of the tool's own, such as `{ mode: 'fast' }`. Rule 1 of spec 14.2 applies: no arguments, file contents,
   * prompts, tool output or absolute paths. A field with the name of a common field is left out.
   */
  fields?: Record<string, unknown>;
  /** Where the tool runs. The project is the nearest folder with `harnesspm.json` above it. Default: the current folder. */
  cwd?: string;
  /** How long the tool ran, in milliseconds. */
  duration?: number;
  /** The tool's exit code. */
  exit?: number;
  /**
   * Exit codes that are answers, not failures, such as `[1]` for a lint that found problems. They set the event's
   * `outcome`: `ok` for 0, `answer` for a code in this list, `failed` for any other code (spec 14.2).
   */
  answers?: number[];
}

/** Fields that harnesspm sets on every `run` event. A tool's own fields never replace them. */
const RESERVED = new Set(['schema', 'type', 'time', 'project', 'repository', 'workspace', 'harnesspm', 'caller', 'agent', 'session', 'unit', 'package', 'version', 'exit', 'outcome', 'duration', 'outside']);

const UNIT_ID = /^[^\s:]+:\S+$/;

function contextOf(projectDir: string, index: TelemetryIndex | undefined): EventContext {
  // `sync` writes the index when agent events are on. Without it, read the same facts from the project.
  if (index) return { projectDir, project: index.project, ...(index.repository !== undefined ? { repository: index.repository } : {}), workspaces: index.workspaces };
  const pkg = readJsonIfExists(path.join(projectDir, 'package.json'));
  const project = isRecord(pkg) && typeof pkg['name'] === 'string' ? pkg['name'] : path.basename(projectDir);
  return { projectDir, project, workspaces: findWorkspaces(projectDir).map((dir) => relPosix(projectDir, dir)) };
}

/**
 * Sends a `run` event for a tool of the project, as `harnesspm run` does for a script (spec 14.2). It applies every
 * opt-out and sends nothing while the handler is held (spec 14.5, 14.6). It never throws, never prints and never
 * waits: a command handler gets the event in a detached process, so a tool can call it right before `process.exit()`.
 */
export function reportRun(report: RunReport): void {
  let projectDir: string | undefined;
  try {
    projectDir = configDir(report.cwd ?? process.cwd());
    if (projectDir === undefined) return;
    const state = readTelemetryState(projectDir);
    if (state.send === undefined || !state.events.has('run')) return;
    if (typeof report.unit !== 'string' || !UNIT_ID.test(report.unit)) {
      note(projectDir, `reportRun: "${String(report.unit)}" is not a unit ID such as app:scripts/probe`);
      return;
    }
    const index = readIndex(projectDir);
    const own = Object.fromEntries(Object.entries(report.fields ?? {}).filter(([key]) => !RESERVED.has(key)));
    const pkg = index?.packages[report.unit.slice(0, report.unit.indexOf(':'))];
    const exit = typeof report.exit === 'number' ? report.exit : undefined;
    const answers = Array.isArray(report.answers) ? report.answers.filter((code) => Number.isInteger(code) && code >= 1 && code <= 255) : [];
    sendEvent(
      state,
      contextOf(projectDir, index),
      {
        type: 'run',
        ...commandCaller(),
        unit: report.unit,
        package: pkg?.package,
        version: pkg?.version,
        ...own,
        exit,
        outcome: runOutcome(exit, answers),
        duration: typeof report.duration === 'number' ? Math.round(report.duration) : undefined,
        // The caller's folder, not `cwd`: a tool that an agent starts from another repository runs outside the project.
        ...outsideField(projectDir),
      },
      report.cwd ?? process.cwd(),
    );
  } catch (error) {
    if (projectDir !== undefined) note(projectDir, `reportRun: ${(error as Error).message}`);
  }
}
