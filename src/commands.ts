// CLI commands for projects and authors (spec chapter 10).
import * as path from 'node:path';
import { checkHarness } from './check.ts';
import { CONFIG_FILE, CONFIG_SCHEMA } from './config.ts';
import { applyPlan, checkPlan, computePlan, STATE_DIR } from './outputs.ts';
import { withClaudeImport } from './render.ts';
import { resolve } from './resolve.ts';
import { HarnessError, isFile, isRecord, readJson, readTextIfExists, relPosix, writeIfChanged } from './util.ts';

export interface Output {
  log(line: string): void;
  warn(line: string): void;
}

const printWarnings = (out: Output, warnings: string[]): void => {
  for (const w of [...new Set(warnings)]) out.warn(`⚠️  ${w}`);
};

export function sync(projectDir: string, out: Output, options: { check?: boolean } = {}): number {
  const res = resolve(projectDir);
  const plan = computePlan(res);
  printWarnings(out, [...res.warnings, ...plan.warnings]);
  if (options.check) {
    const problems = checkPlan(res, plan);
    for (const p of problems) out.log(`❌ ${p}`);
    if (problems.length > 0) {
      out.log('Run `npx harnesspm sync` and commit the result.');
      return 1;
    }
    out.log('✅ harnesspm outputs are up to date');
    return 0;
  }
  const changed = applyPlan(res, plan);
  const n = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
  const counts = `${n(res.rules.length, 'rule')}, ${n(res.skills.length, 'skill')}, ${n(res.docs.length, 'doc')} from ${n(res.packages.length, 'package')}`;
  out.log(changed.length > 0 ? `harnesspm: ${counts}. Updated ${n(changed.length, 'file')}.` : `harnesspm: ${counts}. Nothing changed.`);
  return 0;
}

export function init(projectDir: string, out: Output): number {
  const pkgFile = path.join(projectDir, 'package.json');
  if (!isFile(pkgFile)) throw new HarnessError('No package.json here. Run `npm init` first.');
  const configFile = path.join(projectDir, CONFIG_FILE);
  if (!isFile(configFile)) {
    writeIfChanged(configFile, `${JSON.stringify({ $schema: CONFIG_SCHEMA }, null, 2)}\n`);
    out.log(`Created ${CONFIG_FILE}`);
  }
  const raw = readTextIfExists(pkgFile)!;
  const pkg = readJson(pkgFile);
  if (!isRecord(pkg)) throw new HarnessError('package.json must be a JSON object');
  // A private package is never installed by others, so `postinstall` is safe there, and Yarn 2+ runs only
  // `postinstall`. A published package uses `prepare`, which does not run when others install it.
  const scripts = isRecord(pkg['scripts']) ? pkg['scripts'] : {};
  const hookName = pkg['private'] === true ? 'postinstall' : 'prepare';
  const has = (name: string): boolean => typeof scripts[name] === 'string' && (scripts[name] as string).includes('harnesspm sync');
  if (!has('prepare') && !has('postinstall')) {
    const current = typeof scripts[hookName] === 'string' ? (scripts[hookName] as string) : undefined;
    scripts[hookName] = current === undefined ? 'harnesspm sync' : `${current} && harnesspm sync`;
    pkg['scripts'] = scripts;
    const indent = /^\{\r?\n(\s+)/.exec(raw)?.[1] ?? '  ';
    writeIfChanged(pkgFile, `${JSON.stringify(pkg, null, indent)}\n`);
    out.log(`Added \`harnesspm sync\` to the "${hookName}" script`);
  }
  const claudeFile = path.join(projectDir, 'CLAUDE.md');
  if (writeIfChanged(claudeFile, withClaudeImport(readTextIfExists(claudeFile)))) out.log('CLAUDE.md now imports AGENTS.md');
  return sync(projectDir, out);
}

export function status(projectDir: string, out: Output): number {
  const res = resolve(projectDir);
  const plan = computePlan(res);
  const deps = res.packages.filter((p) => p.layer === 'dependencies');
  const describe = (name: string, version: string): string => `${name} ${version}`;
  const tops = deps.filter((p) => p.direct);
  const parts = tops.map((p) => {
    const below = deps.filter((d) => p.closure.has(d.name)).map((d) => describe(d.name, d.version));
    return below.length > 0 ? `${describe(p.name, p.version)} → ${below.join(', ')}` : describe(p.name, p.version);
  });
  const viaProject = deps.filter((d) => !d.direct && !tops.some((t) => t.closure.has(d.name)));
  parts.push(...viaProject.map((d) => describe(d.name, d.version)));
  out.log(`📦 dependencies  ${parts.length > 0 ? parts.join(' · ') : 'none'}`);

  const own = res.packages.find((p) => p.layer === 'project');
  const config = res.config;
  const counts = [
    config.exclude.length > 0 ? `${config.exclude.length} exclude` : '',
    Object.keys(config.replace).length > 0 ? `${Object.keys(config.replace).length} replace` : '',
    Object.keys(config.patch).length > 0 ? `${Object.keys(config.patch).length} patch` : '',
  ].filter(Boolean);
  const projectParts = [`${CONFIG_FILE}: ${counts.length > 0 ? counts.join(' · ') : 'no changes'}`];
  if (own) projectParts.push(`harness/ (plugin ${own.plugin})`);
  out.log(`🏢 project       ${projectParts.join(' · ')}`);

  const bytes = Buffer.byteLength(plan.agentsMd);
  const claudeLines = plan.agentsMd.split('\n').length + plan.claudeMd.split('\n').length;
  out.log(`📏 always-on     Codex ${(bytes / 1024).toFixed(1)} KiB of 32 KiB · Claude Code ${claudeLines} lines`);
  if (bytes > 28 * 1024) out.warn('⚠️  AGENTS.md is close to Codex\'s 32 KiB limit. Move details into on-demand rules or docs.');
  printWarnings(out, [...res.warnings, ...plan.warnings]);
  return 0;
}

export function why(projectDir: string, id: string, out: Output): number {
  const res = resolve(projectDir);
  const row = (label: string, value: string): void => out.log(`${label.padEnd(11)} ${value}`);
  const rel = (file: string): string => {
    for (const pkg of res.packages) {
      if (pkg.layer !== 'project' && file.startsWith(pkg.dir + path.sep)) {
        return path.posix.join(STATE_DIR.split(path.sep).join('/'), 'pkgs', pkg.name, relPosix(pkg.dir, file));
      }
    }
    return relPosix(res.projectDir, file);
  };
  const excluded = res.excludedUnits.find((u) => u.id === id);
  const rule = res.rules.find((r) => r.id === id);
  const skill = res.skills.find((s) => s.id === id);
  const docs = res.docs.find((d) => d.id === id);
  const pkg = rule?.pkg ?? skill?.pkg ?? docs?.pkg;
  if (!pkg) {
    if (excluded) {
      row('excluded', `by ${excluded.by}`);
      return 0;
    }
    const plugin = id.split(':')[0];
    const near = [...res.rules.map((r) => r.id), ...res.skills.map((s) => s.id)].filter((x) => x.startsWith(`${plugin}:`)).slice(0, 5);
    throw new HarnessError(`No unit ${id}.${near.length > 0 ? ` Units of ${plugin}: ${near.join(', ')}` : ''}`);
  }
  if (pkg.layer === 'project') row('owner', `project ${pkg.name} (harness/)`);
  else row('owner', `dependency ${pkg.name} ${pkg.version}${pkg.via !== undefined ? ` (via ${pkg.via})` : ''}`);
  const source = rule?.source ?? (skill ? path.join(skill.dir, 'SKILL.md') : docs!.dir);
  row('source', rel(source));
  if (rule?.replacedBy) row('replaced', `by ${rule.replacedBy.by}: ${rel(rule.replacedBy.file!)}`);
  if (rule && rule.original !== rule.source) row('original', rel(rule.original));
  for (const p of rule?.patches ?? []) row('patch', `${p.patch} (from ${p.by})`);
  if (pkg.repository !== undefined) row('repository', pkg.repository);
  if (pkg.layer === 'project') row('editable', 'yes. Edit the source, then run `npx harnesspm sync`.');
  else row('editable', `no. Add a \`patch\`, \`replace\` or \`exclude\` in ${CONFIG_FILE}, or propose the change upstream.`);
  return 0;
}

export function check(target: string, out: Output): number {
  const result = checkHarness(target);
  printWarnings(out, result.warnings);
  for (const e of result.errors) out.log(`❌ ${e}`);
  out.log(`📏 always-on text of ${result.plugin}: ${(result.alwaysOnBytes / 1024).toFixed(1)} KiB`);
  if (result.errors.length > 0) return 1;
  out.log('✅ harness is valid');
  return 0;
}
