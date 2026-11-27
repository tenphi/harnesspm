import { defineDocsConfig } from '@tenphi/cookbook/config';
import harnesspmPackage from './package.json' with { type: 'json' };

/*
  The site has two tabs. "Guide" has one page per topic, for people and agents
  alike. A page that starts a task opens with what a person decides and a
  prompt to give an agent, then has every step. Its sidebar is grouped by
  task, and its "AI agents" group holds the prompts for after setup and the
  agent start page. "Reference" has the lookup tables.

  Prompts in the wild link to /guides/ routes, so a guide keeps its route. The
  routes of the pages that were merged into the guides redirect to them.

  The specification (docs/spec/) and the research notes (docs/research/) stay on
  GitHub, and site pages link to them there: docs/spec/ is also the docs index
  that harnesspm's own harness gives to agents, and it ships in the npm package.
*/
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
        link: 'https://www.npmjs.com/package/@harnesspm/cli',
        newTab: true,
      },
    ],
  },
  // Page view analytics with Umami, on every page of the site.
  head: [
    {
      tag: 'script',
      attrs: {
        defer: true,
        src: 'https://umami.tenphi.me/script.js',
        'data-website-id': 'f0b144c3-e6cc-4a38-9b09-8f62578cc74d',
      },
    },
  ],
  editLink: {
    baseUrl: 'https://github.com/tenphi/harnesspm/edit/main/',
  },
  lastUpdated: true,
  content: {
    sources: [
      { id: 'home', file: 'docs-site/index.mdx', route: '/' },
      // Pages with a route of their own are .mdx files, named one by one.
      { id: 'ask', file: 'docs/guide/ask-your-agent.mdx', route: '/ask-your-agent' },
      { id: 'agents', file: 'docs/guide/agents.mdx', route: '/agents' },
      // Every .md file in docs/guide/ is a guide.
      { id: 'guides', glob: 'docs/guide/*.md', base: 'docs/guide', routeBase: '/guides' },
      { id: 'reference', glob: 'docs/guide/reference/*.md', base: 'docs/guide/reference', routeBase: '/reference' },
    ],
  },
  redirects: {
    '/getting-started': '/guides/setup',
    '/share': '/guides/share',
    '/bring-your-own': '/guides/add-your-own',
  },
  navigation: {
    tabs: [
      {
        label: 'Guide',
        link: '/',
        items: [
          {
            label: 'Start',
            items: [
              { label: 'Home', link: '/' },
              { label: 'Get started', link: '/guides/setup' },
            ],
          },
          {
            label: 'Use',
            items: [
              { label: 'Use a package’s harness', link: '/guides/use' },
              { label: 'Change upstream units', link: '/guides/change-upstream' },
              { label: 'Add your own harness', link: '/guides/add-your-own' },
              { label: 'Cloud sessions', link: '/guides/cloud' },
            ],
          },
          {
            label: 'Share',
            items: [{ label: 'Share from a library', link: '/guides/share' }],
          },
          {
            label: 'Run',
            items: [
              { label: 'Trust and safety', link: '/guides/trust' },
              { label: 'Monorepos', link: '/guides/monorepos' },
              { label: 'Telemetry', link: '/guides/telemetry' },
            ],
          },
          {
            label: 'AI agents',
            items: [
              { label: 'Ask your agent', link: '/ask-your-agent' },
              { label: 'Agent start page', link: '/agents' },
            ],
          },
        ],
      },
      {
        label: 'Reference',
        link: '/reference/cli',
        items: [
          { label: 'CLI', link: '/reference/cli' },
          { label: 'harnesspm.json', link: '/reference/config' },
          { label: 'Package format', link: '/reference/package-format' },
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
