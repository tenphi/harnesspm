#!/usr/bin/env node
// Draft. Validates harness changes for agents: `npx tack run tack:check`.
// Runs `tack pack-check` when the project has a harness/ folder, then `tack sync --check --no-local`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const projectDir = process.env.TACK_PROJECT_DIR ?? process.cwd();
const steps = [];

if (existsSync(join(projectDir, 'harness', 'plugin.json'))) {
  steps.push(['pack-check']);
}
steps.push(['sync', '--check', '--no-local']);

for (const args of steps) {
  const result = spawnSync('npx', ['tack', ...args], { cwd: projectDir, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
