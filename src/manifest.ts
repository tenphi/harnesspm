// Reading one harness package (spec chapter 2).
import * as path from 'node:path';
import { parseFrontmatter, stringList } from './frontmatter.ts';
import { HarnessError, isDir, isFile, isRecord, listDir, readJson, readJsonIfExists, readText } from './util.ts';

export const NS = 'dev.harnesspm';
export const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

export type Layer = 'dependencies' | 'project' | 'personal';

export interface ScriptDef {
  file: string;
  description?: string;
  allow?: boolean;
}

export interface Extension {
  extends: string[];
  exclude: string[];
  replace: Record<string, string>;
  patch: Record<string, string>;
  docs?: string;
  scripts: Record<string, ScriptDef>;
  projects: Record<string, string>;
}

export interface HarnessPackage {
  /** npm package name, or the project's package name for its own harness. */
  name: string;
  version: string;
  plugin: string;
  description?: string;
  repository?: string;
  /** Package root, as a real path. */
  dir: string;
  harnessDir: string;
  ext: Extension;
  layer: Layer;
  /** Problems that `harnesspm check` reports. `sync` prints them as warnings. */
  problems: string[];
}

const CORE_FIELDS = new Set(['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions']);
const EXT_FIELDS = new Set(['extends', 'exclude', 'replace', 'patch', 'docs', 'scripts', 'projects']);
const PLUGIN_NAME = /^[a-z0-9][a-z0-9.-]*$/;

function stringMap(value: unknown, field: string, problems: string[]): Record<string, string> {
  if (value === undefined) return {};
  if (isRecord(value) && Object.values(value).every((v) => typeof v === 'string')) return value as Record<string, string>;
  problems.push(`"${field}" must map strings to strings`);
  return {};
}

function repositoryUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value['url'] === 'string') return value['url'];
  return undefined;
}

/** Reads `<dir>/harness/plugin.json`. Returns undefined when the folder has no harness. */
export function loadHarnessPackage(dir: string, layer: Layer): HarnessPackage | undefined {
  const harnessDir = path.join(dir, 'harness');
  const manifestFile = path.join(harnessDir, 'plugin.json');
  if (!isFile(manifestFile)) return undefined;
  const manifest = readJson(manifestFile);
  if (!isRecord(manifest)) throw new HarnessError(`${manifestFile} must be a JSON object`);
  const pkgJson = readJsonIfExists(path.join(dir, 'package.json'));
  const pkg = isRecord(pkgJson) ? pkgJson : {};
  const problems: string[] = [];

  if (manifest['$schema'] !== PLUGIN_SCHEMA) problems.push(`"$schema" must be "${PLUGIN_SCHEMA}"`);
  for (const key of Object.keys(manifest)) if (!CORE_FIELDS.has(key)) problems.push(`unknown field "${key}" in plugin.json`);
  const plugin = manifest['name'];
  if (typeof plugin !== 'string' || !PLUGIN_NAME.test(plugin)) {
    throw new HarnessError(`${manifestFile}: "name" must be lowercase letters, digits, "-" and "."`);
  }

  const extensions = manifest['extensions'];
  const rawExt = isRecord(extensions) && isRecord(extensions[NS]) ? extensions[NS] : {};
  for (const key of Object.keys(rawExt)) if (!EXT_FIELDS.has(key)) problems.push(`unknown field "${key}" in extensions["${NS}"]`);

  const list = (field: string): string[] => {
    const value = rawExt[field];
    if (value === undefined) return [];
    const result = stringList(value);
    if (!result || typeof value === 'string') {
      problems.push(`"${field}" must be an array of strings`);
      return [];
    }
    return result;
  };

  const scripts: Record<string, ScriptDef> = {};
  if (rawExt['scripts'] !== undefined) {
    if (!isRecord(rawExt['scripts'])) problems.push('"scripts" must be an object');
    else {
      for (const [name, def] of Object.entries(rawExt['scripts'])) {
        if (!isRecord(def) || typeof def['file'] !== 'string') {
          problems.push(`script "${name}" needs a "file"`);
          continue;
        }
        scripts[name] = {
          file: def['file'],
          ...(typeof def['description'] === 'string' ? { description: def['description'] } : {}),
          ...(def['allow'] === true ? { allow: true } : {}),
        };
      }
    }
  }

  let docs: string | undefined;
  if (rawExt['docs'] !== undefined) {
    if (typeof rawExt['docs'] === 'string') docs = rawExt['docs'];
    else problems.push('"docs" must be a path');
  }

  const ext: Extension = {
    extends: list('extends'),
    exclude: list('exclude'),
    replace: stringMap(rawExt['replace'], 'replace', problems),
    patch: stringMap(rawExt['patch'], 'patch', problems),
    ...(docs !== undefined ? { docs } : {}),
    scripts,
    projects: stringMap(rawExt['projects'], 'projects', problems),
  };

  const version = typeof manifest['version'] === 'string' ? manifest['version'] : typeof pkg['version'] === 'string' ? pkg['version'] : '0.0.0';
  const description = typeof manifest['description'] === 'string' ? manifest['description'] : undefined;
  const repository = repositoryUrl(manifest['repository']) ?? repositoryUrl(pkg['repository']);
  return {
    name: typeof pkg['name'] === 'string' ? pkg['name'] : path.basename(dir),
    version,
    plugin,
    ...(description !== undefined ? { description } : {}),
    ...(repository !== undefined ? { repository } : {}),
    dir,
    harnessDir,
    ext,
    layer,
    problems,
  };
}

export type Activation = 'always' | 'file' | 'demand';

export interface RuleSource {
  kind: 'rules';
  id: string;
  name: string;
  pkg: HarnessPackage;
  file: string;
}

export interface SkillSource {
  kind: 'skills';
  id: string;
  name: string;
  pkg: HarnessPackage;
  dir: string;
}

export interface DocsSource {
  kind: 'docs';
  id: string;
  pkg: HarnessPackage;
  dir: string;
}

export interface PackageUnits {
  rules: RuleSource[];
  skills: SkillSource[];
  docs?: DocsSource;
}

/** Finds a package's units. Files in `skip` (replacements and patches) are not units. */
export function discoverUnits(pkg: HarnessPackage, skip: Set<string>): PackageUnits {
  const rulesDir = path.join(pkg.harnessDir, NS, 'rules');
  const rules: RuleSource[] = listDir(rulesDir)
    .filter((f) => f.endsWith('.md') && !skip.has(path.join(rulesDir, f)))
    .map((f) => {
      const name = f.slice(0, -3);
      return { kind: 'rules', id: `${pkg.plugin}:rules/${name}`, name, pkg, file: path.join(rulesDir, f) };
    });
  const skillsDir = path.join(pkg.harnessDir, 'skills');
  const skills: SkillSource[] = listDir(skillsDir)
    .filter((f) => isFile(path.join(skillsDir, f, 'SKILL.md')))
    .map((name) => ({ kind: 'skills', id: `${pkg.plugin}:skills/${name}`, name, pkg, dir: path.join(skillsDir, name) }));
  const units: PackageUnits = { rules, skills };
  if (pkg.ext.docs !== undefined) {
    const dir = path.resolve(pkg.harnessDir, pkg.ext.docs);
    if (isDir(dir)) units.docs = { kind: 'docs', id: `${pkg.plugin}:docs`, pkg, dir };
  }
  return units;
}

export interface RuleMeta {
  activation: Activation;
  description?: string;
  paths?: string[];
  title: string;
  body: string;
}

/** Reads a rule's activation from its frontmatter (spec 2.5). */
export function ruleMeta(text: string, fallbackTitle: string, file: string): RuleMeta {
  const { data, body } = parseFrontmatter(text, file);
  const description = typeof data['description'] === 'string' ? data['description'] : undefined;
  const paths = stringList(data['paths']);
  const activation: Activation = paths ? 'file' : description !== undefined ? 'demand' : 'always';
  const titleMatch = /^#\s+(.+?)\s*$/m.exec(body);
  return {
    activation,
    ...(description !== undefined ? { description } : {}),
    ...(paths ? { paths } : {}),
    title: titleMatch ? titleMatch[1]! : fallbackTitle,
    body,
  };
}

export function readRule(file: string): string {
  return readText(file);
}
