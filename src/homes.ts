// Where each agent keeps its user-level files. Tests and people can move them with environment variables.
import * as os from 'node:os';
import * as path from 'node:path';

export function claudeHome(): string {
  return process.env['CLAUDE_CONFIG_DIR'] ?? path.join(os.homedir(), '.claude');
}

/** Claude Code keeps MCP servers of user and local scope here. */
export function claudeJsonFile(): string {
  const dir = process.env['CLAUDE_CONFIG_DIR'];
  return dir !== undefined ? path.join(dir, '.claude.json') : path.join(os.homedir(), '.claude.json');
}

export function codexHome(): string {
  return process.env['CODEX_HOME'] ?? path.join(os.homedir(), '.codex');
}

export function agentsHome(): string {
  return path.join(os.homedir(), '.agents');
}

/** harnesspm's own folder for working copies, caches and state. */
export function harnesspmHome(): string {
  return process.env['HARNESSPM_HOME'] ?? path.join(os.homedir(), '.harnesspm');
}
