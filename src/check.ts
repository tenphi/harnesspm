// harnesspm check: validate a harness before it is published (spec 2.10).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFrontmatter, stringList } from './frontmatter.ts';
import { discoverExecUnits } from './exec-units.ts';
import { discoverUnits, loadHarnessPackage, NS, ruleMeta } from './manifest.ts';
import { gitKeeps, HarnessError, isDir, isFile, isRecord, readJsonIfExists, readText, relPosix } from './util.ts';

export interface CheckResult {
  errors: string[];
  warnings: string[];
  alwaysOnBytes: number;
  plugin: string;
}

const SECRET_PATTERNS: [RegExp, string][] = [
  // A key has a body: a header alone is an example or a placeholder. Encrypted PEM puts `Name: value` lines first.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----\s*(?:[\w-]+: [^\n]*\n\s*)*[A-Za-z0-9+/=]{40,}/, 'a private key'],
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

/** A fence line: its indent, its run of backticks or tildes, and the rest of the line. */
const FENCE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
/** An escaped character, a code span (backticks closed by a run of the same length within one paragraph), or backticks that open nothing. */
const CODE_SPAN = /\\[\s\S]|(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)|`+/g;

/**
 * A Markdown page with its code samples blanked out, so that a link in a sample is not checked (spec 2.10):
 * fenced code blocks and code spans, as CommonMark reads them. A fence that is never closed runs to the end of the page.
 * A fence may be indented, as in a list item. Its closing fence is indented at most 3 columns more.
 * Indented code blocks stay: telling one from a list item's paragraph needs a full Markdown parser.
 */
function withoutCode(text: string): string {
  const lines = text.split(/\r?\n/);
  let open: { char: string; length: number; indent: number } | undefined;
  for (const [i, line] of lines.entries()) {
    const fence = FENCE.exec(line);
    if (open) {
      if (fence && fence[2]![0] === open.char && fence[2]!.length >= open.length && fence[3]!.trim() === '' && fence[1]!.length <= open.indent + 3) open = undefined;
      lines[i] = '';
    } else if (fence && !(fence[2]![0] === '`' && fence[3]!.includes('`'))) {
      // The info string of a backtick fence has no backticks: such a line starts a code span instead.
      open = { char: fence[2]![0]!, length: fence[2]!.length, indent: fence[1]!.length };
      lines[i] = '';
    }
  }
  // Spaces keep the text around a span apart, so that `[a]` and `(b)` on each side of it do not become a link.
  return lines.join('\n').replace(CODE_SPAN, (match: string, ticks?: string) => (ticks === undefined ? match : match.replace(/[^\n]/g, ' ')));
}

/** A docs folder's files without the ones git ignores, as the lock and the index count them (spec 2.7). */
function docsFiles(dir: string): string[] {
  const keeps = gitKeeps(dir);
  return walkFiles(dir).filter((file) => keeps(relPosix(dir, file)));
}

/** A `files` pattern as a test of a path relative to the package root: the path itself, or a folder above it. */
function filesPattern(pattern: string): ((rel: string) => boolean) | undefined {
  const clean = pattern.replace(/^\.?\//, '').replace(/\/+$/, '');
  if (clean === '' || /[[\]{}()+@]/.test(clean)) return undefined;
  const source = clean
    .split('**')
    .map((part) => part.replace(/[.^$|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
    .join('.*')
    .replace(/\.\*\//g, '(?:.*/)?');
  const re = new RegExp(`^${source}(?:/.*)?$`);
  return (rel) => re.test(rel);
}

/**
 * Whether npm packs a path, read from `files` in package.json as npm reads it (spec 2.10): a listed path, a folder
 * and what is in it, or a glob, less `!` entries, plus the files npm always packs. npm packs by `files`, not by
 * `.gitignore`, so docs built at `prepack` ship. `undefined` without `files`, or with a pattern this doesn't read,
 * such as braces: then `check` asks git, as the index does. It never runs npm, whose `pack --dry-run` runs the
 * package's `prepare` even with `--ignore-scripts`.
 */
function packs(root: string): ((rel: string) => boolean) | undefined {
  const pkg = readJsonIfExists(path.join(root, 'package.json'));
  if (!isRecord(pkg) || !Array.isArray(pkg['files'])) return undefined;
  const include: ((rel: string) => boolean)[] = [];
  const exclude: ((rel: string) => boolean)[] = [];
  for (const entry of pkg['files']) {
    if (typeof entry !== 'string') return undefined;
    const test = filesPattern(entry.replace(/^!/, ''));
    if (!test) return undefined;
    (entry.startsWith('!') ? exclude : include).push(test);
  }
  const named = [pkg['main'], ...(typeof pkg['bin'] === 'string' ? [pkg['bin']] : isRecord(pkg['bin']) ? Object.values(pkg['bin']) : [])]
    .filter((file): file is string => typeof file === 'string')
    .map((file) => file.replace(/^\.\//, ''));
  const always = (rel: string): boolean => /^(package\.json|(readme|licen[cs]e)(\..*)?)$/i.test(rel) || named.includes(rel);
  return (rel) => always(rel) || (include.some((test) => test(rel)) && !exclude.some((test) => test(rel)));
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
      // The folder itself, a parent of it, or entries inside it, such as `docs/components` or `docs/*.md`.
      const covers = (f: string): boolean => docsRel === f || docsRel.startsWith(`${f}/`) || f.startsWith(`${docsRel}/`);
      if (!files.some(covers)) errors.push(`package.json: "files" must include the docs folder "${docsRel}", or entries inside it`);
    }
  }

  const checkPath = (label: string, rel: string, mustExist: 'file' | 'dir'): void => {
    const full = path.resolve(pkg.harnessDir, rel);
    if (!inside(root, full)) errors.push(`${label}: ${rel} points outside the package`);
    else if (mustExist === 'file' ? !isFile(full) : !isDir(full)) errors.push(`${label}: ${rel} does not exist`);
  };
  // A replacement has the shape of the unit it replaces: a rule's file, or a skill's folder (spec 3.4).
  const replacedSkills: { dir: string; name: string }[] = [];
  for (const [id, file] of Object.entries(pkg.ext.replace)) {
    const skill = /:skills\/(.+)$/.exec(id)?.[1];
    if (skill !== undefined) {
      checkPath(`replace ${id}`, file, 'dir');
      const dir = path.resolve(pkg.harnessDir, file);
      if (isDir(dir) && inside(root, dir)) replacedSkills.push({ dir, name: skill });
    } else {
      checkPath(`replace ${id}`, file, 'file');
      if (!id.includes(':rules/')) errors.push(`replace ${id}: replace works on rules and skills only. Exclude the unit and add one of your own instead.`);
    }
  }
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
  // A skill's `name` is its folder's name. A replacement takes the name of the skill it replaces, as agents see it there.
  const checkSkill = (dir: string, name: string, why: string): void => {
    const file = path.join(dir, 'SKILL.md');
    try {
      const { data, hasFrontmatter } = parseFrontmatter(readText(file), file);
      if (!hasFrontmatter) errors.push(`${show(file)}: needs frontmatter with "name" and "description"`);
      if (data['name'] !== name) errors.push(`${show(file)}: "name" must be "${name}", ${why}`);
      if (typeof data['description'] !== 'string' || data['description'].trim() === '') errors.push(`${show(file)}: needs a "description"`);
    } catch (error) {
      errors.push((error as Error).message);
    }
  };
  for (const skill of units.skills) {
    checkSkill(skill.dir, skill.name, 'the folder name');
    if (!skill.name.startsWith(`${pkg.plugin}-`) && skill.name !== pkg.plugin) {
      warnings.push(`skill "${skill.name}" should start with the plugin name, such as "${pkg.plugin}-${skill.name}"`);
    }
  }
  for (const skill of replacedSkills) {
    if (isFile(path.join(skill.dir, 'SKILL.md'))) checkSkill(skill.dir, skill.name, 'the name of the skill it replaces');
    else errors.push(`replace: ${show(skill.dir)} needs a SKILL.md`);
  }
  // Judge the docs and links by what ships (spec 2.10). Without `files` to read, by the files git keeps.
  const packed = packs(root);
  const ships = (file: string): boolean => (packed === undefined ? fs.existsSync(file) : packed(relPosix(root, file)));
  // Docs pages in a generated index (spec 2.7): the index takes their title and description from the frontmatter.
  const docs = units.docs ? (packed === undefined ? docsFiles(units.docs.dir) : walkFiles(units.docs.dir).filter(ships)) : [];
  if (units.docs && !(isFile(path.join(units.docs.dir, 'llms.txt')) && ships(path.join(units.docs.dir, 'llms.txt')))) {
    for (const file of docs) {
      if (!/\.mdx?$/.test(file)) continue;
      try {
        parseFrontmatter(readText(file), show(file));
      } catch (error) {
        errors.push((error as Error).message);
      }
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
  const scanned = [...walkFiles(pkg.harnessDir), ...docs];
  for (const file of [...new Set(scanned)]) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [pattern, what] of SECRET_PATTERNS) if (pattern.test(text)) warnings.push(`${show(file)} looks like it contains ${what}`);
    if (!/\.mdx?$/.test(file)) continue;
    const docsPage = units.docs !== undefined && inside(units.docs.dir, file);
    for (const match of withoutCode(text).matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
      const link = match[1]!;
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('/')) continue;
      const target = path.resolve(path.dirname(file), decodeURI(link));
      if (!inside(root, target)) errors.push(`${show(file)}: the link ${link} points outside the package`);
      else if (!fs.existsSync(target)) errors.push(`${show(file)}: the link ${link} points at a missing file`);
      else if (isFile(target) && !ships(target)) errors.push(`${show(file)}: the link ${link} points at a file the package does not ship`);
      // Projects search a copy of the docs folder alone (spec 4.3, note 8), where such a link leads nowhere.
      else if (docsPage && !inside(units.docs!.dir, target)) {
        warnings.push(`${show(file)}: the link ${link} leaves the docs folder, so it leads nowhere in the docs copy that agents search. Link to a page in the docs folder, or to the file's URL.`);
      }
    }
  }
  return { errors, warnings, alwaysOnBytes, plugin: pkg.plugin };
}
