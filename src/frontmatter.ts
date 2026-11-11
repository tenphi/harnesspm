import { parse, stringify } from 'yaml';
import { HarnessError, isRecord } from './util.ts';

export interface Parsed {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
}

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** Splits a Markdown file into its YAML frontmatter and its body. */
export function parseFrontmatter(text: string, file = 'file'): Parsed {
  const match = FRONTMATTER.exec(text);
  if (!match) return { data: {}, body: text, hasFrontmatter: false };
  let data: unknown;
  try {
    data = match[1] ? parse(match[1]) : {};
  } catch (error) {
    throw new HarnessError(`Invalid frontmatter in ${file}: ${(error as Error).message}`);
  }
  if (data === null || data === undefined) data = {};
  if (!isRecord(data)) throw new HarnessError(`Frontmatter in ${file} must be a mapping`);
  return { data, body: text.slice(match[0].length), hasFrontmatter: true };
}

export function withFrontmatter(data: Record<string, unknown>, body: string): string {
  if (Object.keys(data).length === 0) return body;
  return `---\n${stringify(data).trimEnd()}\n---\n\n${body.replace(/^\n+/, '')}`;
}

export function stringList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
  return undefined;
}
