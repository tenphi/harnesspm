// harnesspm check: validate a harness before it is published (spec 2.10).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFrontmatter, stringList } from './frontmatter.ts';
import { discoverExecUnits } from './exec-units.ts';
import { discoverUnits, loadHarnessPackage, NS, ruleMeta } from './manifest.ts';
import { HarnessError, isDir, isFile, isRecord, readJsonIfExists, readText, relPosix } from './util.ts';

export interface CheckResult {
  errors: string[];
  warnings: string[];
  alwaysOnBytes: number;
  plugin: string;
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'a GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'an API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, 'a Slack token'],
];

function inside(dir: string, file: string): boolean {
  const rel = path.relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  if (isDir(dir)) walk(dir);
  return files.sort();
}

/** `target` is a package root, or a harness/ folder, or an added harness folder. */
export function checkHarness(target: string): CheckResult {
  let root = path.resolve(target);
  if (path.basename(root) === 'harness' && isFile(path.join(root, 'plugin.json'))) root = path.dirname(root);
  const pkg = loadHarnessPackage(root, 'project');
  if (!pkg) throw new HarnessError(`No harness found: ${relPosix(process.cwd(), path.join(root, 'harness', 'plugin.json'))} does not exist`);
  const errors = [...pkg.problems];
  const warnings: string[] = [];
  const show = (file: string): string => relPosix(root, file);

  const pkgJson = readJsonIfExists(path.join(root, 'package.json'));
  if (isRecord(pkgJson) && Array.isArray(pkgJson['files'])) {
    const files = pkgJson['files'].filter((f): f is string => typeof f === 'string').map((f) => f.replace(/^\.\//, '').replace(/\/$/, ''));
    if (!files.includes('harness')) errors.push('package.json: "files" must include "harness"');
    if (pkg.ext.docs !== undefined) {
      const docsRel = relPosix(root, path.resolve(pkg.harnessDir, pkg.ext.docs));
      if (!files.some((f) => docsRel === f || docsRel.startsWith(`${f}/`))) errors.push(`package.json: "files" must include the docs folder "${docsRel}"`);
    }
  }

  const checkPath = (label: string, rel: string, mustExist: 'file' | 'dir'): void => {
    const full = path.resolve(pkg.harnessDir, rel);
    if (!inside(root, full)) errors.push(`${label}: ${rel} points outside the package`);
    else if (mustExist === 'file' ? !isFile(full) : !isDir(full)) errors.push(`${label}: ${rel} does not exist`);
  };
  for (const [id, file] of Object.entries(pkg.ext.replace)) checkPath(`replace ${id}`, file, 'file');
  for (const [id, file] of Object.entries(pkg.ext.patch)) {
    checkPath(`patch ${id}`, file, 'file');
    if (!id.includes(':rules/')) errors.push(`patch ${id}: patches work on rules only`);
  }
  if (pkg.ext.docs !== undefined) checkPath('docs', pkg.ext.docs, 'dir');
  for (const [name, def] of Object.entries(pkg.ext.scripts)) {
    if (!def.file.startsWith('./')) errors.push(`script ${name}: "file" must start with "./"`);
    checkPath(`script ${name}`, def.file, 'file');
  }
  for (const [remote, dir] of Object.entries(pkg.ext.projects)) checkPath(`project entry ${remote}`, dir, 'dir');

  const overrideFiles = new Set([...Object.values(pkg.ext.replace), ...Object.values(pkg.ext.patch)].map((f) => path.resolve(pkg.harnessDir, f)));
  const units = discoverUnits(pkg, overrideFiles);
  let alwaysOnBytes = 0;
  for (const rule of units.rules) {
    try {
      const text = readText(rule.file);
      const meta = ruleMeta(text, rule.name, rule.file);
      const { data } = parseFrontmatter(text, rule.file);
      if (data['paths'] !== undefined && !stringList(data['paths'])) errors.push(`${show(rule.file)}: "paths" must be a string or a list of strings`);
      if (data['description'] !== undefined && typeof data['description'] !== 'string') errors.push(`${show(rule.file)}: "description" must be a string`);
      if (meta.activation === 'always') alwaysOnBytes += Buffer.byteLength(meta.body);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  for (const skill of units.skills) {
    const file = path.join(skill.dir, 'SKILL.md');
    try {
      const { data, hasFrontmatter } = parseFrontmatter(readText(file), file);
      if (!hasFrontmatter) errors.push(`${show(file)}: needs frontmatter with "name" and "description"`);
      if (data['name'] !== skill.name) errors.push(`${show(file)}: "name" must be "${skill.name}", the folder name`);
      if (typeof data['description'] !== 'string' || data['description'].trim() === '') errors.push(`${show(file)}: needs a "description"`);
      if (!skill.name.startsWith(`${pkg.plugin}-`) && skill.name !== pkg.plugin) {
        warnings.push(`skill "${skill.name}" should start with the plugin name, such as "${pkg.plugin}-${skill.name}"`);
      }
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  let jsonOk = true;
  for (const json of ['mcp.json', path.join(NS, 'hooks.json'), path.join(NS, 'permissions.json')]) {
    const file = path.join(pkg.harnessDir, json);
    if (isFile(file)) {
      try {
        JSON.parse(readText(file));
      } catch (error) {
        jsonOk = false;
        errors.push(`${show(file)}: ${(error as Error).message}`);
      }
    }
  }
  if (jsonOk) {
    try {
      discoverExecUnits(pkg, errors);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  // Links in Markdown and secrets in any file.
  const scanned = [...walkFiles(pkg.harnessDir), ...(units.docs ? walkFiles(units.docs.dir) : [])];
  for (const file of [...new Set(scanned)]) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [pattern, what] of SECRET_PATTERNS) if (pattern.test(text)) warnings.push(`${show(file)} looks like it contains ${what}`);
    if (!file.endsWith('.md')) continue;
    for (const match of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
      const link = match[1]!;
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('/')) continue;
      const target = path.resolve(path.dirname(file), decodeURI(link));
      if (!inside(root, target)) errors.push(`${show(file)}: the link ${link} points outside the package`);
      else if (!fs.existsSync(target)) errors.push(`${show(file)}: the link ${link} points at a missing file`);
    }
  }
  return { errors, warnings, alwaysOnBytes, plugin: pkg.plugin };
}
