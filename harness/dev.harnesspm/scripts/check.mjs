#!/usr/bin/env node
// Draft. Validates harness changes for agents: `npx harnesspm run harnesspm:check`.
// Runs `harnesspm check` when the project has a harness/ folder, then `harnesspm sync --check --no-local`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const projectDir = process.env.HARNESSPM_PROJECT_DIR ?? process.cwd();
const steps = [];

if (existsSync(join(projectDir, 'harness', 'plugin.json'))) {
  steps.push(['check']);
}
steps.push(['sync', '--check', '--no-local']);

for (const args of steps) {
  const result = spawnSync('npx', ['harnesspm', ...args], { cwd: projectDir, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
