import { readdirSync } from 'node:fs';
import { defineDocsConfig } from '@tenphi/cookbook/config';
import harnesspmPackage from './package.json' with { type: 'json' };

/*
  docs/spec/ is also the docs index that harnesspm's own harness gives to
  agents (harness/plugin.json → "docs"), so the site reads its chapters as they
  are. Each chapter gets a route without its number: 01-overview.md →
  /spec/overview. Relative links between chapters keep working, because
  Cookbook resolves them by file path.
*/
const specDescriptions: Record<string, string> = {
  overview: 'How harnesspm works, its goals, terms and base scenarios.',
  'package-format': 'The harness/ folder: an Agent Plugins plugin plus the harnesspm extension.',
  resolution: 'Layers, extends, overrides, versions and monorepos.',
  outputs: 'What harnesspm writes for Claude Code and Codex, and what is committed.',
  executables: 'Scripts, hooks, MCP servers and permissions.',
  trust: 'What may run, and how changes are reviewed through the lock.',
  added: 'A team’s or a person’s workflow, context and tools, added on top of a repository.',
  improving: 'How agents change any harness under its owner’s rules.',
  cloud: 'Claude Code cloud sessions and added harnesses.',
  cli: 'Every harnesspm command.',
  standards: 'Which open standards harnesspm uses and where it goes beyond them.',
  dogfooding: 'How this repository uses and publishes its own harness.',
  'open-questions': 'Undecided points, and options removed in review.',
  telemetry: 'Opt-in events about how agents and people use a harness.',
};

const specChapters = readdirSync(new URL('./docs/spec/', import.meta.url))
  .filter((file) => /^\d+-.+\.md$/.test(file))
  .sort()
  .map((file) => {
    const slug = file.replace(/^\d+-/, '').replace(/\.md$/, '');
    return {
      file: `docs/spec/${file}`,
      route: `/spec/${slug}`,
      description: specDescriptions[slug],
    };
  });

export default defineDocsConfig({
  site: {
    title: 'harnesspm',
    version: harnesspmPackage.version,
    description: 'The harness package manager: share agent rules, docs, skills and tools through npm packages.',
    url: 'https://harnesspm.tenphi.me',
    repository: 'https://github.com/tenphi/harnesspm',
    logo: './assets/harnesspm.svg',
    favicon: {
      source: './assets/harnesspm.svg',
      background: '#1b6b66',
    },
    headerLinks: [
      {
        label: 'npm',
        link: 'https://www.npmjs.com/package/@tenphi/harnesspm',
        newTab: true,
      },
    ],
  },
  editLink: {
    baseUrl: 'https://github.com/tenphi/harnesspm/edit/main/',
  },
  lastUpdated: true,
  content: {
    sources: [
      { id: 'home', file: 'docs-site/index.mdx', route: '/' },
      { id: 'start', file: 'docs/guide/getting-started.mdx', route: '/getting-started' },
      { id: 'guides', glob: 'docs/guide/*.md', base: 'docs/guide', routeBase: '/guides' },
      { id: 'reference', glob: 'docs/guide/reference/*.md', base: 'docs/guide/reference', routeBase: '/reference' },
      {
        id: 'spec-index',
        file: 'docs/spec/README.md',
        route: '/spec',
        description: 'The harnesspm specification: every chapter, and where to start.',
      },
      ...specChapters,
      {
        id: 'research',
        glob: 'docs/research/**/*.md',
        base: 'docs/research',
        routeBase: '/research',
      },
    ],
  },
  navigation: {
    items: [
      { label: 'Home', link: '/' },
      '/getting-started',
      {
        label: 'Guides',
        items: [
          { label: 'Use a package’s harness', link: '/guides/use' },
          { label: 'Share from a library', link: '/guides/share' },
          { label: 'Add your own', link: '/guides/add-your-own' },
          { label: 'Change upstream units', link: '/guides/change-upstream' },
          { label: 'Trust and safety', link: '/guides/trust' },
          { label: 'Monorepos', link: '/guides/monorepos' },
          { label: 'Cloud sessions', link: '/guides/cloud' },
          { label: 'Telemetry', link: '/guides/telemetry' },
        ],
      },
      {
        label: 'Reference',
        items: [
          { label: 'CLI', link: '/reference/cli' },
          { label: 'harnesspm.json', link: '/reference/config' },
          { label: 'Package format', link: '/reference/package-format' },
        ],
      },
      {
        label: 'Specification',
        link: '/spec',
        items: specChapters.map((chapter) => chapter.route),
      },
      {
        label: 'Research',
        items: [
          '/research/agent-capabilities',
          '/research/motivating-case',
          '/research/package-managers',
          '/research/prior-art',
        ],
      },
    ],
  },
  theme: {
    brand: { from: '#1b6b66' },
    styles: {
      /*
        Code groups carry a tab per package manager or file; the language
        caption under the tabs repeats what the tab already says.
      */
      CodeGroup: { Caption: { hide: true } },
      /*
        Some headings are names in code (`~/.harnesspm/config.json`) that
        can't wrap on a phone and would widen the page.
      */
      MarkdownHeading: { Heading: { overflowWrap: 'anywhere' } },
      /*
        The hero has no image: one centered column, with less space around
        it, so the install commands under it show above the fold.
      */
      Hero: {
        gridColumns: 'minmax(0, 1fr)',
        blockPadding: {
          '': 'clamp(2.5rem, 5vw, 4.5rem) start, 2.5rem end',
          '!@md': '4x start, 2rem end',
        },
        Stack: { alignItems: 'center', textAlign: 'center' },
        Title: { inlineSize: 'max 24ch' },
        Tagline: { inlineSize: 'max 60ch' },
        Actions: { justifyContent: 'center' },
      },
    },
  },
});
