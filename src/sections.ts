// Markdown sections and patches (spec 2.5).
import { parseFrontmatter, stringList, withFrontmatter } from './frontmatter.ts';
import { hash } from './util.ts';

export interface Heading {
  line: number;
  level: number;
  text: string;
}

/** ATX headings outside fenced code blocks. */
export function headings(lines: string[]): Heading[] {
  const result: Heading[] = [];
  let fence: string | undefined;
  lines.forEach((line, index) => {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === undefined) fence = marker[0];
      else if (marker[0] === fence) fence = undefined;
      return;
    }
    if (fence !== undefined) return;
    const match = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line);
    if (match) result.push({ line: index, level: match[1]!.length, text: match[2]!.trim() });
  });
  return result;
}

/** A section is a heading and everything up to the next heading of the same or a higher level. */
function sectionEnd(lines: string[], hs: Heading[], index: number): number {
  const own = hs[index]!;
  for (let i = index + 1; i < hs.length; i++) {
    if (hs[i]!.level <= own.level) return hs[i]!.line;
  }
  return lines.length;
}

export interface PatchSection {
  level: number;
  text: string;
  lines: string[];
}

export interface PatchSpec {
  remove: string[];
  preamble: string[];
  sections: PatchSection[];
}

export function parsePatch(text: string, file = 'patch'): PatchSpec {
  const { data, body } = parseFrontmatter(text, file);
  const lines = body.split('\n');
  const hs = headings(lines);
  const first = hs[0]?.line ?? lines.length;
  const sections: PatchSection[] = [];
  let i = 0;
  while (i < hs.length) {
    const end = sectionEnd(lines, hs, i);
    sections.push({ level: hs[i]!.level, text: hs[i]!.text, lines: trimBlank(lines.slice(hs[i]!.line, end)) });
    // Skip headings nested in this section: they are part of it.
    i++;
    while (i < hs.length && hs[i]!.line < end) i++;
  }
  return { remove: stringList(data['remove']) ?? [], preamble: trimBlank(lines.slice(0, first)), sections };
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === '') start++;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  return lines.slice(start, end);
}

export interface TouchedSection {
  heading: string;
  hash: string;
}

export interface PatchResult {
  text: string;
  /** Hashes of the rule's sections that the patch replaced or removed, before the patch. */
  touched: TouchedSection[];
  warnings: string[];
}

/** Applies a patch to a rule. The rule's frontmatter is kept. */
export function applyPatch(ruleText: string, patchText: string, patchFile = 'patch'): PatchResult {
  const patch = parsePatch(patchText, patchFile);
  const rule = parseFrontmatter(ruleText);
  const lines = rule.body.split('\n');
  const hs = headings(lines);
  const warnings: string[] = [];
  const touched: TouchedSection[] = [];
  type Op = { start: number; end: number; replacement: string[]; heading: string };
  const ops: Op[] = [];
  const additions: string[][] = [];

  const find = (predicate: (h: Heading) => boolean): { start: number; end: number } | undefined => {
    const index = hs.findIndex(predicate);
    if (index < 0) return undefined;
    return { start: hs[index]!.line, end: sectionEnd(lines, hs, index) };
  };

  for (const section of patch.sections) {
    const target = find((h) => h.level === section.level && h.text === section.text);
    if (target) ops.push({ ...target, replacement: [...section.lines, ''], heading: section.text });
    else additions.push(section.lines);
  }
  for (const heading of patch.remove) {
    const target = find((h) => h.text === heading);
    if (target) ops.push({ ...target, replacement: [], heading });
    else warnings.push(`${patchFile}: the rule has no section "${heading}" to remove`);
  }

  ops.sort((a, b) => b.start - a.start);
  let limit = Number.POSITIVE_INFINITY;
  for (const op of ops) {
    if (op.end > limit) {
      warnings.push(`${patchFile}: section "${op.heading}" overlaps another change and was skipped`);
      continue;
    }
    touched.push({ heading: op.heading, hash: hash(lines.slice(op.start, op.end).join('\n')) });
    lines.splice(op.start, op.end - op.start, ...op.replacement);
    limit = op.start;
  }

  const tail = [...additions, ...(patch.preamble.length > 0 ? [patch.preamble] : [])];
  let body = trimBlank(lines).join('\n');
  for (const block of tail) body += `\n\n${block.join('\n')}`;
  body += '\n';
  return {
    text: rule.hasFrontmatter ? withFrontmatter(rule.data, body) : body,
    touched: touched.sort((a, b) => a.heading.localeCompare(b.heading)),
    warnings,
  };
}

/** Raises every heading level by `by`, outside code blocks, so a rule fits under a block heading. */
export function demoteHeadings(text: string, by: number): string {
  const lines = text.split('\n');
  for (const h of headings(lines)) {
    const level = Math.min(6, h.level + by);
    lines[h.line] = `${'#'.repeat(level)} ${h.text}`;
  }
  return lines.join('\n');
}
