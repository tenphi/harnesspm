// Runs a telemetry command handler for one event, in a detached process (spec 14.3).
// harnesspm starts it and does not wait. It passes the event and the command in the environment.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TIMEOUT = 10_000;

const event = process.env['HARNESSPM_EVENT'] ?? '';
const command = process.env['HARNESSPM_HANDLER'] ?? '';
const env = { ...process.env };
delete env['HARNESSPM_EVENT'];
delete env['HARNESSPM_HANDLER'];

function note(message: string): void {
  try {
    const dir = path.join(process.cwd(), 'node_modules', '.harnesspm');
    if (fs.existsSync(dir)) fs.appendFileSync(path.join(dir, 'telemetry.log'), `${new Date().toISOString()} ${message.replace(/\s+/g, ' ').slice(0, 2000)}\n`);
  } catch {
    // Nobody is waiting for this process.
  }
}

if (event !== '' && command !== '') {
  const result = spawnSync(command, { shell: true, input: `${event}\n`, env, stdio: ['pipe', 'ignore', 'pipe'], timeout: TIMEOUT, encoding: 'utf8' });
  if (result.error) note(`handler \`${command}\`: ${result.error.message}`);
  else if (result.status !== 0) note(`handler \`${command}\` exited with ${result.status ?? result.signal}: ${result.stderr}`);
}
