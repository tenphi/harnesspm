// harnesspm.json (spec 3.7).
import * as path from 'node:path';
import { stringList } from './frontmatter.ts';
import { HarnessError, isRecord, readJsonIfExists } from './util.ts';

export const CONFIG_FILE = 'harnesspm.json';
export const CONFIG_SCHEMA = 'https://unpkg.com/harnesspm/schema/harnesspm.schema.json';

export type TrustValue = true | 'pin';

export interface ProjectConfig {
  exclude: string[];
  replace: Record<string, string>;
  patch: Record<string, string>;
  trust: Record<string, TrustValue>;
  warnings: string[];
}

const FIELDS = new Set(['$schema', 'exclude', 'replace', 'patch', 'trust']);

export function readConfig(projectDir: string): ProjectConfig {
  const file = path.join(projectDir, CONFIG_FILE);
  const raw = readJsonIfExists(file) ?? {};
  if (!isRecord(raw)) throw new HarnessError(`${file} must be a JSON object`);
  const warnings: string[] = [];
  for (const key of Object.keys(raw)) if (!FIELDS.has(key)) warnings.push(`${CONFIG_FILE}: unknown field "${key}"`);
  const map = (field: string): Record<string, string> => {
    const value = raw[field];
    if (value === undefined) return {};
    if (isRecord(value) && Object.values(value).every((v) => typeof v === 'string')) return value as Record<string, string>;
    throw new HarnessError(`${CONFIG_FILE}: "${field}" must map strings to strings`);
  };
  const exclude = raw['exclude'] === undefined ? [] : stringList(raw['exclude']);
  if (!exclude) throw new HarnessError(`${CONFIG_FILE}: "exclude" must be an array of strings`);
  const trust: Record<string, TrustValue> = {};
  if (raw['trust'] !== undefined) {
    if (!isRecord(raw['trust'])) throw new HarnessError(`${CONFIG_FILE}: "trust" must be an object`);
    for (const [name, value] of Object.entries(raw['trust'])) {
      if (value === true || value === 'pin') trust[name] = value;
      else throw new HarnessError(`${CONFIG_FILE}: trust for "${name}" must be true or "pin"`);
    }
  }
  return { exclude, replace: map('replace'), patch: map('patch'), trust, warnings };
}
